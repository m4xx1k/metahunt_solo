# dedup-rebuild — pairwise rule + deterministic cluster rebuild

**Branch:** `fix/dedup-rebuild`
**Status:** in-review (draft PR; prod rollout pending owner)
**Started:** 2026-09-25 · **Closed:** —

## Outcome

Code complete on a draft PR (#225); prod rollout pending owner review. Local rehearsal on a fresh
prod dump: 0 false merges on a 300-pair blind audit (the old partition: 68/120), cluster recall 0.66,
same-board violations 1 060 → 0, `plan` after `apply` = 0 diff, `apply current.json` restores exactly.

---

## 0. Read this first (autonomous run contract)

This file is written for an agent running unattended. The owner is away and **cannot answer
questions**. Every decision below is already made — do not re-open it. If something truly blocks
you, write it down in `.private/dedup-rebuild/REPORT.md` under **Blocked**, skip that subtask,
and carry on with everything that does not depend on it.

### Hard boundaries — never cross, no matter what

- **No writes to the production database.** Reads only, via
  `railway ssh --service Postgres -- "psql -U postgres -d railway ..."`. No `UPDATE/INSERT/DELETE/DDL`,
  no `--apply`/`--yes-prod`, no CLI of ours pointed at prod. `pg_dump` is a read — allowed.
- **No merge to `main`, no push to `main`, no deploy, no `railway` mutating command**
  (redeploy, variables, restart), **no Temporal schedule changes.**
- Push `fix/dedup-rebuild` and open a **draft** PR — allowed. Do not mark it ready.
- **OpenAI spend cap: $2 total** (one local `embed --force` over ~20.5k rows is ≈ $0.3).
- Nothing with user PII goes into the repo (see `CLAUDE.md` §2). Vacancy titles/descriptions
  are public job-board data, but corpus dumps and labelled pairs go to `.private/dedup-rebuild/`
  anyway (size, and descriptions are long).
- Follow `CLAUDE.md` (pnpm only, minimal comments, English artifacts, `pnpm db:generate` for schema).

### Preconditions (the owner does these before starting the run)

- Docker Desktop WSL integration on; `pnpm docker:infra` up (local Postgres on `54323`).
- `.env` points `DATABASE_URL` at the local Postgres (it does: `localhost:54323/metahunt_railway`)
  and has `OPENAI_API_KEY`.
- `railway` CLI logged in; `railway ssh --service Postgres` works (verified 2026-09-25).

If Docker is not reachable: do T0–T3 and T6 (pure code + unit tests + golden set built from prod
reads), skip T4/T5 local rehearsal, and say so in the report.

### Definition of done for this run

1. Draft PR from `fix/dedup-rebuild` with T1–T7 implemented, CI-equivalent checks green locally:
   `pnpm lint`, `pnpm build:all`, `pnpm test:etl`, `pnpm test:etl:int`, `pnpm test:web`, `pnpm db:check`.
2. Full local rehearsal on a fresh prod dump: `embed --force` → `plan` → `apply` → `plan` shows
   **0 diff**; acceptance numbers in §4 met.
3. `.private/dedup-rebuild/REPORT.md` written (shape in T9), including the exact prod rollout
   commands for the owner and the 50 labelled pairs the owner should eyeball.

---

## 1. Why (short)

The current resolver (`apps/etl/src/02-enrich/dedup/dedup.service.ts`) is incremental,
order-dependent and sticky: it walks vacancies by `published_at`, glues each one to the best
group by embedding cosine ≥ 0.92, and never revisits. Consequences, measured on prod 2026-09-25
(20 554 vacancies):

- 2 431 multi-member groups hold 6 404 vacancies (31%); 649 groups ≥3, 174 ≥5, 27 ≥10, max 28.
- **Transitive chaining**: gates are pairwise, groups are unions → Ajax Systems group = 28 members,
  17 distinct QA roles across DOU+Djinni; Ciklum .NET group = 26 members, 25 distinct requisition
  numbers. 1 459 groups contain two same-source members with different content.
- Same-source pairs with different content: 5 818 — 4 009 with different titles (false merges),
  1 809 with the same title (1 516 of them with description trigram ≥ 0.8 → genuine reposts).
- Cross-source ANN pairs: 1 035 — 793 already share a normalized title-token set; the rest are
  mostly formatting variants, a few real false merges ("Інженер БпЛА (RnD)" ↔ "(FPV)" ↔ "(gimbal)").
- Djinni has **56% vacancies with `company_id IS NULL`** (DOU 2.8%) → a pure `company+title` key
  loses most cross-source recall; company can only be a veto, not a requirement.
- Membership is sticky: a vacancy whose content changes keeps its old group
  (`vacancy.repository.ts` keeps `unique_vacancy_id`; `resolveInOwnGroup` leaves it there).
- Manual unmerge is impossible — the next reset/resolve erases it.
- Title — the strongest identity signal — never gates a merge; it only feeds the gold/confirmed label.

Uncommitted work on the starting tree (same-source ANN ban, requisition-number gate, zero-skill
veto, title suffix stripping, description-only embedding text) is the seed for this branch: keep
what fits the design below, delete the rest. `md/journal/migrations/dedup-system.md` (untracked)
contains useful measurements but also wrong claims (e.g. "title vetoes block merges" — no such
code). Fold the still-true measurements into §Decisions here and delete that file.

### What references `unique_vacancies.id` (verified — ids are safe to change)

| Consumer | Stores | Breaks if ids change? |
|---|---|---|
| `sent_notifications` | **vacancy** id | No — digest anti-join maps sent postings → current position at query time (`feed.service.ts` `excludeIds`) |
| `/vacancy/<slug>-<uuid>` URLs, sitemap | vacancy id | No |
| web `DuplicatesBadge`, vacancy page | group id, only for an immediate `/feed/group/:id` fetch | No |
| `positions`, `position_nodes`, scoring, facets, tracks | live views over `unique_vacancies` | No |
| `market_snapshot_positions` | position id | Table does not exist in prod; no writer in code |

Still keep ids stable where cheap (T3 id rule) — it keeps the diff small and the dashboard sane.

### Real digest risks (design must respect them)

1. A split-out vacancy loaded within the last 14 days that matches a subscription **will be sent**
   as new. Correct for real false merges; wrong for reposts we fail to merge → the repost rule (T1)
   is mandatory. `plan` must print how many positions become newly eligible (T4).
2. A false merge silently hides a job forever once any member was sent — the bug we are fixing.
3. No "reset window": the rollout must never leave the corpus as singletons while the digest runs.
   `apply` writes the whole new partition in one transaction (T5).

---

## 2. The design (decided)

Three pure functions + one writer. No embedding thresholds hidden in SQL, no centroids, no tiers.

### 2.1 Candidate retrieval (unchanged idea)

For a posting `v`: pgvector ANN top-20 within ±45 days (**no** role/seniority/company filters in
SQL any more — they move into `vetoes`) ∪ postings with the same `rss_records.content_fingerprint`.
Embeddings are used for retrieval and as one description signal, nothing else.

### 2.2 `vetoes(a, b): VetoReason | null` — any hit forbids `a` and `b` in one group

1. Manual override: a `dedup_overrides` row `(a, b, 'different')` exists.
2. Company: both resolved and different.
3. Requisition number: both titles carry one and they differ (reuse the seed regex, but only
   count `(1234)` / `#1234` shapes with 3–6 digits; ignore `%`, `$`, years 2020–2035 — add tests).
4. Seniority: both known and different. Role node: both known and different.
5. Same source and different content fingerprint, **unless** `isRepost(a, b)`.

Time is **not** a veto: a job reposted every 30 days for 4 months must stay one cluster, and a
complete-veto on `published_at` distance would split it. The ±45-day window only bounds which
pairs can form a *link* (retrieval + `isSame`).

Shape for extensibility: vetoes are an ordered array of small named functions
`(a: PostingFacts, b: PostingFacts, ctx) => VetoReason | null`, and link rules are an ordered
array `(a, b, ctx) => MatchEvidence | null`. Adding a condition = one function + its unit tests
+ one golden-eval run + one `plan` diff. `buildClusters` and the writer never change for a new rule.

### 2.3 `isSame(a, b): MatchEvidence | null` — positive link (only evaluated if no veto)

- Identical `content_fingerprint` → `rule: 'exact'`.
- `isRepost(a, b)` (same source only): same company (or both null) **and** identical `titleKey`
  **and** description shingle containment ≥ 0.9 → `rule: 'repost'`.
- Cross-source: `titleSim(a, b) ≥ T_title` **and** (`containment ≥ T_text` **or** cosine ≥ `T_cos`)
  → `rule: 'cross_source'`. When either company is null, use the stricter pair
  (`titleKey` equal **and** (`containment ≥ T_text` or cosine ≥ `T_cos_strict`)).

Definitions (all in one small module, e.g. `dedup/match-rules.ts`):

- `titleKey(title)`: decode entities (`&amp;` …), lowercase, strip the DOU suffix
  `" в <Company>, <locations/salary>"` / `" at <Company>"` (derive the exact shape from ≥200 real
  DOU titles — the naive `\s+(в|at)\s+.*$` misses `"в SKELAR, Варшава (Польща)"` and salary tails
  like `"$5000–6000"`), drop city/format stopwords, drop requisition numbers, keep parenthesised
  qualifiers (`(RnD)` vs `(FPV)` must stay different), sorted unique token set joined by space.
- `titleSim`: Jaccard over `titleKey` tokens **with seniority words removed** (seniority is its own veto).
- `containment`: 5-word shingles over `cleanDescription()` text, `|A∩B| / min(|A|,|B|)`.
- Starting thresholds: `T_title = 0.6`, `T_text = 0.8`, `T_cos = 0.92`, `T_cos_strict = 0.95`.
  Calibrate on the golden set (T6) under the constraint **zero false merges**; record the final
  values and the curve in §Decisions.

### 2.4 `buildClusters(postings, links, vetoes)` — deterministic

Sort postings by `(published_at, id)`. For each `p`: the candidate clusters are those with at
least one member `q` where `isSame(p, q)`; drop every cluster in which **any** member vetoes `p`
(complete-veto — this is what kills chaining); pick the cluster with the strongest link
(exact > repost > cross_source, then higher containment, then older cluster); else start a new
cluster. Same input → same output. Also used by the sweep on a small affected set.

### 2.5 Writer — one function for both the sweep and full rebuild

`writePartition(clusters, tx)`:

- **Stable id rule:** each cluster takes the current `unique_vacancy_id` of its oldest member,
  unless an older cluster already claimed that id → new uuid.
- Update `vacancies.unique_vacancy_id`, `dedup_reason` (new shape below), `deduplicated_at = now()`.
- Insert new `unique_vacancies` rows, `repairUniqueVacancy()` every touched group, delete empty ones.
- Lock order stays vacancy → group (`FOR UPDATE ... ORDER BY id`), as in the loader.
- Race with the loader: inside the transaction re-check every pending vacancy's version
  (`last_rss_record_id`, `embedding_source_hash`, `embedding_model` — what
  `lockCurrentResolveVersion` does today). A vacancy that changed since it was loaded is left
  pending for the next sweep; if the check fails for the vacancy being resolved, abort and retry
  next sweep rather than writing a stale partition.
- ANN queries: the HNSW index `vacancies_embedding_hnsw_idx` exists; keep the ANN query
  filter-light (date window + `embedding IS NOT NULL`) and `SET LOCAL hnsw.ef_search = 100` so
  post-filtering does not starve the top-20.

**Sweep (5-min Temporal schedule, `resolveAll`)**: for each pending vacancy, affected set = the
vacancy ∪ all members of its current group ∪ all members of every candidate's group; load them,
compute pairs in TS (embeddings are already loaded; ≤ a few hundred rows), `buildClusters`,
`writePartition`. This also fixes sticky membership: an edited vacancy that no longer matches its
group is split out on its next resolve. No loader change needed beyond verifying that.

**Full rebuild (`plan` / `apply`)**: the same `buildClusters` over the whole corpus; candidate
pairs from one ANN query per posting (read-only).

### 2.6 `DedupReason` (new, small)

```ts
{ rule: "exact" | "repost" | "cross_source"; matchedAgainstVacancyId: string;
  titleSim: number; containment: number; cosine: number | null; decidedAt: string }
```

Drop `confidence`, `corroboration`, `prefilterMatches`, `method`, `similarity`. `apply` rewrites
every row, so no old shapes survive. Every consumer must move in the same PR (verified list —
re-grep `dedupReason|dedup_reason` before finishing):

- `apps/etl/src/02-enrich/dedup/dedup.contract.ts`, `dedup.service.ts` read side
  (`listGroups`, `getGroupForFeed`, `getMetrics` — `similarityBuckets` → counts per `rule`).
- `apps/etl/src/02-enrich/dedup/dedup.controller.ts` — drop `confidence`/`minSimilarity` params.
- `apps/web/lib/api/dedup.ts`, `apps/web/lib/api/vacancies.ts` (types).
- `apps/web/app/dashboard/dedupe/*` (`GroupCard`, `WhyMerged`, page filters).
- **Public** `apps/web/entities/vacancy/DuplicatesBadge.tsx` — replace the cosine "similarity"
  bar with a short rule label (3–5 words, e.g. "same text", "reposted", "same job, other board").
- `apps/etl/test/int/vacancy-loader.int.spec.ts`, `admin/dedup/exact-content-repair.cli.ts` (deleted).

### 2.7 Module layout (target — adjust names if the code suggests better ones)

```
apps/etl/src/02-enrich/dedup/
  match-rules.ts        PostingFacts; titleKey, titleSim, shingles, containment, requisitionNo;
                        VETOES[], LINK_RULES[]; vetoes(a,b,ctx), isSame(a,b,ctx)      — pure
  clusters.ts           buildClusters(facts[], links[], vetoFn) → Cluster[]            — pure
  partition.repository.ts  loadFacts(ids), findCandidates(v), loadAffectedSet(v),
                        loadOverrides(ids), writePartition(clusters, tx)               — SQL only
  dedup.service.ts      embedAll, resolveAll (sweep), plan, apply, read side (dashboard/feed)
  dedup.cli.ts          embed | resolve | plan | apply   (db-target guard on writes)
apps/etl/src/admin/dedup/dedup-eval.cli.ts   golden-set precision/recall
```

`PostingFacts = { id, sourceId, companyId, title, titleKey, seniority, roleNodeId, publishedAt,
fingerprint, shingles: Set<string>, embedding: number[] }` — built once per posting, so rules
never touch the DB.

### 2.8 Removals

`centroid_embedding` usage and the centroid gate, gold/confirmed tiers, `pickBestGroup`,
published-order sticky resolve, `resetAll` + `dedup:reset`, `admin/dedup/exact-content-repair.cli.ts`
+ `dedup:repair-exact`, `exact_content_conflicts` writes, `countExactContentSplits` (replace with a
`sameSourceViolations` count in the sweep log).
**Do not drop columns/tables in this PR** (`centroid_embedding`, `exact_content_conflicts`) —
rollback must stay possible; schema drop is a follow-up PR after prod is verified (T10).

---

## 3. Subtasks

- [x] **T0 — Branch & baseline** — `git switch -c fix/dedup-rebuild` carrying the uncommitted
  tree; `pnpm test:etl` green; save prod baseline numbers (§1 queries) to
  `.private/dedup-rebuild/baseline.md`. — *done when:* branch exists, baseline file written.

- [x] **T1 — Rules module** — `match-rules.ts`: `titleKey`, `titleSim`, `shingles`, `containment`,
  `requisitionNo`, `vetoes`, `isRepost`, `isSame`. Pure, no DB. Unit tests with real-shaped cases:
  Holy Water AI Engineer ≠ AI Video Creator; Ciklum `(3117)` ≠ `(3118)`; `(100% remote)` is not a
  requisition; DOU `"… в SKELAR, Варшава (Польща)"` == Djinni `"…"`; `"QA\QC"` == `"QA \ QC"`;
  `"Automation QA Engineer"` == `"QA Automation Engineer"`; `"Інженер БпЛА (RnD)"` ≠ `"(FPV)"`;
  19 near-identical "Senior SDET" Djinni reposts = repost; two same-title different-project
  outsourcer postings with shared boilerplate and different project text ≠ same.
  — *done when:* tests green.

- [x] **T2 — Clustering** — `buildClusters` (§2.4) + tests: chain DOU-A ~ Djinni-B ~ DOU-C (A≠C
  same source) → A and C never together; manual `different` override splits; determinism
  (shuffled input → identical output); edited vacancy leaves its group. — *done when:* tests green.

- [x] **T3 — Writer + sweep rewrite** — `writePartition` with the stable id rule; rewrite
  `resolveOne/resolveAll` onto affected-set rebuild; new `DedupReason`; removals from §2.8;
  update `dedup.service.spec.ts` and `test/int/dedup.int.spec.ts` (keep coverage of pagination,
  exact merge, same-source split, and add: edited vacancy is split out; stable ids kept).
  — *done when:* `pnpm test:etl` and `pnpm test:etl:int` green.

- [x] **T4 — `plan` (read-only)** — new CLI command `dedup plan [--out <dir>]`: loads the corpus,
  builds the target partition, diffs against current. Writes to `<dir>` (default
  `.private/dedup-rebuild/plan-<timestamp>/`):
  `summary.md` (groups before/after, members in multi-groups, size histogram, splits, merges,
  moved vacancies, `sameSourceViolations` before/after — must be 0 after, top-30 clusters with
  titles/company/sources, **positions newly eligible for the digest** = split-out positions with
  `first_loaded_at` in the last 14 days), `target.json` and `current.json` partitions
  (`vacancyId → groupKey`). Never writes to the DB. — *done when:* runs on the local dump.

- [x] **T5 — `apply` + prod guard** — `dedup apply --partition <file> [--yes-prod]` writes a
  partition file via `writePartition` in **one transaction**. Rollback = `apply` the saved
  `current.json`. Wire every writing dedup command (`embed`, `resolve`, `apply`) through
  `apps/etl/src/platform/config/db-target.ts`: print `target: host:port/db`, refuse non-local
  without `--yes-prod`. Update root `package.json` scripts (`dedup:plan`, `dedup:apply`; remove
  `dedup:reset`, `dedup:repair-exact`) and fix the `CLAUDE.md` §6 line that calls
  `dedup:resolve` a dry-run. — *done when:* `apply` then `plan` on local = 0 diff;
  `apply current.json` restores the original partition exactly; non-local target refused.

- [x] **T6 — Golden set + eval** — from prod reads, sample ~300 pairs into
  `.private/dedup-rebuild/golden.jsonl` (title, company, source, cleaned description, fingerprint,
  seniority, role, published_at, label `same|different`, `labelConfidence`), stratified:
  60 same-source different-title merged, 60 same-source same-title merged, 60 cross-source
  same-title merged, 60 cross-source different-title merged, 60 unmerged near-misses (cosine
  0.85–0.92, same company or same titleKey) for recall. Label by reading both postings, and
  **label before running the rules on them** — write `golden.jsonl` first and never edit a
  label to make a rule pass (the only allowed edit is a documented mislabel, listed in the
  report). Eval CLI
  `apps/etl/src/admin/dedup/dedup-eval.cli.ts <golden.jsonl>` prints precision / recall / FP list
  per rule. Calibrate §2.3 thresholds. Put the 50 lowest-confidence labels in the report for
  the owner. — *done when:* **0 false merges** on `different` pairs, recall reported.

- [x] **T7 — Manual detach** — `dedup_overrides` table (`vacancy_a uuid`, `vacancy_b uuid`,
  `verdict text` check `= 'different'`, `created_at`, `created_by` nullable user id,
  PK `(vacancy_a, vacancy_b)`, check `vacancy_a < vacancy_b`, FKs to `vacancies` with
  `ON DELETE CASCADE`) via
  `pnpm db:generate`. Operator endpoint `POST /operator/unique-vacancies/:groupId/detach
  { vacancyId }` in `dedup.controller.ts` (same `@OperatorApi` guard; drop its `confidence`
  query param with the tiers): inserts `different` for the vacancy vs every other
  member, rebuilds that group's affected set, writes. Web: "Detach" button per member in
  `dashboard/dedupe/_components/GroupCard.tsx`. Int test: detach → rebuild → still detached after
  a full `plan/apply`. — *done when:* tests green, `pnpm db:check` green.

- [x] **T8 — Local rehearsal on a fresh prod dump** —
  1. Dump prod read-only through `railway ssh --service Postgres` (`pg_dump` exists there; stream
     as gzip+base64 if binary stdout is mangled) into `backups/prod-<date>.sql.gz`.
  2. `scripts/db-restore.sh backups/prod-<date>.sql.gz` (local only), `pnpm db:migrate`.
  3. `pnpm dedup:embed --force` (description-only text), then `pnpm dedup:plan`.
  4. Check §4 acceptance; eyeball top-30 clusters; iterate T1/T6 thresholds if needed.
  5. `pnpm dedup:apply --partition <target.json>`, `pnpm dedup:plan` → 0 diff.
  6. Simulate steady state: edit one grouped vacancy's description in the local DB (clear
     `deduplicated_at`, embedding), run `pnpm dedup:embed && pnpm dedup:resolve` → split out.
  — *done when:* all steps pass, numbers recorded in the report.

- [x] **T9 — Docs, PR, report** — ADR `md/journal/decisions/0016-dedup-pairwise-rebuild.md`
  (supersedes the relevant parts of 0012; read 0012 first); update `md/architecture/overview.md`
  dedup section; `md/journal/releases.md` entry; this tracker's subtasks/Decisions. Commit in
  logical steps, push, open a **draft** PR. Write `.private/dedup-rebuild/REPORT.md`:
  **Summary** (5 lines) · **Acceptance** (table vs §4) · **Plan diff** (from T8) · **Golden eval**
  · **50 pairs to eyeball** · **Blocked / skipped** · **Prod rollout** (§5 commands, filled in with
  real paths) · **Risks left**. — *done when:* PR link and report exist.

- [ ] **T10 — Follow-up (not in this run)** — after prod is verified for a week: drop
  `unique_vacancies.centroid_embedding` and `exact_content_conflicts`; optional user-facing
  "not the same job" report in `DuplicatesBadge` writing a pending override.

---

## 4. Acceptance (on the local prod-dump rehearsal)

| Check | Target |
|---|---|
| Golden set false merges | **0** |
| Golden set recall (same pairs) | reported; expected ≥ 0.85 |
| Groups with two same-source members of different content, not a repost | **0** |
| Holy Water `01c4d1af-f7cb-42a0-ac2a-3132ffa550f6` vs `56a8b354-67a1-4066-ad83-c0b5ec8b9057` | different groups |
| Ciklum groups | no group with two different requisition numbers |
| Largest cluster | ≤ 6 members, every member eyeballed as the same job |
| Reposts ("Senior SDET — Data Platform", "Founding Engineer (LLM, RAG…)") | still one group each |
| `plan` after `apply` | 0 diff |
| `apply current.json` | restores the original partition exactly |
| Newly digest-eligible positions | reported (expect hundreds, not thousands; if > 1 000 — flag it) |

---

## 5. Prod rollout (the owner runs this after reviewing the PR + report)

1. Pause `rss-ingest-hourly`, `tg-digest-daytime`, `dedup-sweep`. Temporal is Temporal Cloud
   (public address), so the laptop reaches it with the etl service env injected:
   `railway run --service @metahunt/etl -- npx ts-node --project tsconfig.json scripts/temporal-schedules.ts pause "dedup rebuild"`
   (then `... list` to confirm). A deploy keeps them paused — every scheduler updates with
   `state: prev.state`.
2. Backup: `pg_dump` through `railway ssh --service Postgres` → `backups/` (the T8 method).
3. Merge the PR → etl deploys; the `dedup_overrides` migration auto-runs (`preDeployCommand`).
4. In the etl container (`railway ssh --service @metahunt/etl`; workdir `/app`, verified):
   `node apps/etl/dist/02-enrich/dedup/dedup.cli.js embed --force --yes-prod` → `plan --out /tmp/plan` →
   copy `summary.md` out and read it → `apply --partition /tmp/plan/target.json --yes-prod` →
   `plan` again = 0 diff. Keep `/tmp/plan/current.json` locally — it is the rollback.
5. Verify with the §4 SQL checks on prod.
6. Resume schedules (`... temporal-schedules.ts resume`). The next digest may carry the
   split-out positions counted in `summary.md` (capped at 50 per subscription per run).

Rollback: `apply --partition current.json --yes-prod`; code rollback = revert the PR (no schema
drop in this PR, so the old code still runs).

---

## Decisions

- Rewrite over patching (owner, 2026-09-25): pairwise rules + complete-veto cluster rebuild;
  patches kept chaining and made manual unmerge impossible.
- Same-source reposts merge only via `isRepost` (same title key + containment ≥ 0.9).
- Null company is allowed to merge cross-source only under the strict title/text pair (Djinni 56% null).
- Description-only embedding text stays; full `embed --force` is part of the rollout.
- Manual detach is admin-only for now; user-facing report deferred (T10).
- No user toggles for dedup in the feed or Telegram — if users need one, dedup is wrong.
- **Calibrated thresholds (2026-09-25, 300 blind-labelled pairs, 180 same / 120 different):**
  `T_title = 0.7`, `T_text = 0.8`, `T_cos = 0.94`, `T_cos_strict = 0.95`, repost containment
  `0.8`. Starting values (0.6 / 0.8 / 0.92 / 0.95 / 0.9) gave 4 false merges: three came in on
  cosine 0.925–0.934 with containment ≤ 0.45; one was a same-template ad with a different stack in
  parentheses (titleSim 0.67). Every grid point with 0 false merges needs title ≥ 0.7 and cosine
  ≥ 0.94; among those, text/strict-cosine/repost values move recall by 1–2 pairs only, so the
  conservative end was taken. Result: 0 false merges, pair recall 0.64; cluster-level (after
  the full rebuild) 0 false merges, recall 0.635. The old partition, scored the same way: 68 false
  merges out of 120 `different` pairs.
- **Recall is capped by structure, not thresholds.** Misses by cause: role veto 18,
  same-board text/title change 21, no link 23 (mostly pairs 48–76 days apart, outside the
  window). Measured options for the owner (all 0 false merges, pair recall): drop the role veto
  0.67; repost on containment ≥ 0.95 regardless of title 0.68; both 0.71. A 90-day window gives
  0.69 but 1 false merge. Not adopted — they re-open §2.2 decisions.
- **titleKey drops seniority words, the company's own name, and maps developer/розробник → engineer.**
  Seniority stays a veto and now also reads levels named in titles (disjoint levels veto,
  "Middle/Senior" overlaps "Senior"). Pair recall 0.61 → 0.64, still 0 false merges.
- **HNSW is pinned** (`SET LOCAL enable_seqscan = off`) for candidate retrieval: the date
  predicate is misestimated at ~100 rows, so the planner chose an exact seq scan at 100 ms per
  vacancy (full plan ≈ 35 min) instead of 3 ms through HNSW (full plan 70 s).
- **Content drift splits long-running reposts.** With complete veto, an ad that is edited over
  months (e.g. "Founding Engineer (RAG…)", May–Sep) links adjacent reposts, but an early
  version vetoes a late one once containment drops below the repost threshold. Result: 2–4
  groups instead of 1. Accepted: the alternative (no same-board text veto for same title) re-admits
  the outsourcer "same title, other project" false merges this rewrite exists to stop.
- **`largest ≤ 6` in §4 conflicts with "reposts stay one group":** the largest target groups
  (20, 18, 17, 15) are verbatim repost series of one job. The top-30 target groups (sizes 20–6)
  were read member by member: each is one ad re-published or cross-posted (every link has an
  equal title key and containment ≥ 0.82, most 1.0); none mixes roles. Two mix a named and an
  unnamed level for the same text ("Junior Test Automation…" / "Test Automation…", "Senior
  Python Full Stack" / "Python Full Stack") — the same ad, posted with and without the level.
- **Partition files carry group ids, versions and reasons**, so `apply current.json` restores ids
  exactly and `apply` refuses a file whose vacancies changed or whose coverage differs.
- **The sweep compares all pairs in the affected set; `plan` compares ANN top-20 candidates.**
  They can differ on a pair ANN misses; the next `plan` surfaces it as a diff (ADR-0016).
- **`centroid_embedding` is still written by the rollup** (never read) so a code rollback runs.
- **Folded from the deleted `dedup-system.md` (still true, 2026-08-27 audit, 300 pairs):**
  5-word shingle containment separates true cross-board pairs from different jobs far better
  than embeddings (TPR−FPR 0.98 at 0.70 vs 0.83 description-only embedding, 0.37 with the old
  metadata prefix) — why containment, not cosine, is the primary text signal here. Its claim
  that "title vetoes block merges" was wrong: no such code existed before this rewrite.
- **Rehearsal spend:** one local `embed --force` over 20 557 rows, 17 min, ≈ $0.3.
- **Manual detach is a pair table**, not ADR-0012's `detached_at` (ADR-0016).

## Links

- Previous handoff: `.private/handoff-dedup-holywater-fix.md`
- ADRs: 0012 (position grain & dedup state), 0015 (position read model), 0016 (this — to write)
- PR: [#225](https://github.com/m4xx1k/metahunt_solo/pull/225) (draft)
