# Migration — position grain and the freshness window

**Status:** planned (nothing implemented, nothing committed)
**Started:** 2026-08-07 · **Owner:** repo owner
**Branch:** `feat/canonical-vacancy-grain` (cut from `main` @ `cee7304`)
**Decisions:** [ADR-0012](../decisions/0012-position-grain-and-dedup-state.md) ·
[ADR-0013](../decisions/0013-active-position-window.md)

## Two goals

**1 — Make migrations trustworthy.** Every environment converges on the same schema by itself, and a
file that will never run cannot sit in the migrations folder pretending otherwise. Measured today: prod
and CI are already automated and correct; the gap is local dev plus an unguarded journal.

**2 — Make the data honest.** One definition of "a vacancy" written in the schema, so the product, the
feed and the data lab all inherit it instead of each reinventing it. This is the precondition for saying
true things publicly, and for everything planned on top — skill graphs, co-occurrence, clusters,
trends — because each of those is an aggregate whose denominator is exactly the definition being fixed
here. A skill graph built on the posting grain measures reposting habits as much as the market.

---

## Pre-flight findings (production, read-only, 2026-08-07)

Measured on prod with owner approval. **The local dev snapshot is stale and unrepresentative** — roughly
60% of prod's volume, and it understates every effect below by 2–3×. Sizing decisions use prod; the local
DB is fine for development but must not be used to size a migration again.

| Fact | Prod | Local (stale) | Consequence |
|---|---|---|---|
| postings / positions | 15 089 / 12 763 | 9 298 / 8 876 | local holds ~60% of prod |
| groups with >1 member | **1 536 (12%)** | 365 (4.1%) | reposting is 3× more common than local suggested |
| `unique_vacancy_id IS NULL` | **0** | 0 | conformant in both — no data backfill needed |
| eligible postings vs positions | 14 751 vs **12 448** | 9 049 vs 8 631 | grain error **−15.6%**, not the −4.6% local implied |
| eligible positions, 30d | 4 986 | 2 157 | not the landing number (ADR-0013); it is the feed's default filter |
| corpus span | 2026-05-01 → 2026-08-07 | → 2026-08-02 | landing caption states the span, not "30 днів" |
| `published_at > loaded_at + 1h` | **3 567 (24.2%)** | 1 187 (12.8%) | a quarter of postings get their date bumped by the source |
| `published_at IS NULL` | — | 0 | no missing valid-time, no batch-import artefact |
| applied migrations | **39** (= journal) | **42** | prod's ledger is clean; the drift is local-only |
| `subscriptions.user_id` | nullable | nullable | 0039 has never run **anywhere**, prod included |
| Postgres | 18 | 18 | CI runs 17 — see below |
| matviews | `node_stats`, `node_skill_cooc` | same | both count postings; out of scope, see Phase 4 |
| `first_seen_at` / `last_seen_at` writers | **2, divergent** | same | live drift bug, see Phase 1b |

The null is transient, not a backlog: `VacancyRepository` sets `uniqueVacancyId: null` on any content
change to invalidate derived fields, and `DedupService` drains `WHERE unique_vacancy_id IS NULL`. So the
constraint is a tightening of behaviour that already holds — the risk is in the **write paths**, not in
the data.

### Environment state checked

- Local infra up: `metahunt-db` (pgvector pg18, `:54323`, healthy), temporal, minio, `metahunt-etl-dev`.
- 8 worktrees active. Three are dirty and none touch `vacancies` / dedup / market:
  `met-125-track-picker` (12), `met-54-ats-poc` (20), `met-80-taxonomy-golden-gate` (2). The worktree on
  `main` (`fix+tg-digest-one-per-message`) has 1 dirty file. **No collision expected**, but
  `met-54-ats-poc` is 8 commits ahead and worth re-checking before merge.

### Migration mechanics — how it actually works here

Checked, because the plan below adds migrations and the owner's impression was that they are applied by
hand:

| Environment | How migrations run | Verdict |
|---|---|---|
| Production (Railway) | `deploy.preDeployCommand` runs `libs/database/migrate.ts` before the new version goes live | ✅ correct — once per deploy, not per replica; a failure blocks the deploy instead of crash-looping |
| CI (every PR) | `global-setup.ts` boots an ephemeral testcontainer and applies **all** migrations from zero before the int suite | ✅ the migration path is exercised on every PR |
| Local dev | nothing — `pnpm db:migrate` by hand | ❌ the only real gap |

So "run migrations at app start" is not missing; the repo already uses the stronger form of that idea. A
pre-deploy hook beats an at-boot hook precisely because N replicas booting at once would otherwise race.

Two real defects remain:

- **The journal is the only source of truth, and nothing guards it.** `libs/database/migrations/*.sql`
  and `meta/_journal.json` can disagree silently. Proof:
  `0039_subscriptions_user_id_not_null_after_approved_cleanup.sql` sits on disk, is **absent from the
  journal**, and has therefore never run — in any environment. Local confirms `subscriptions.user_id
  is_nullable = YES`. Its header says it is release-gated, but the gate is implemented *by omission from
  the journal*: silent today, and armed by accident the first time someone regenerates it.
- **The ledger is timestamp-driven, not hash-driven.** The drizzle migrator reads `max(created_at)` from
  `drizzle.__drizzle_migrations` and applies journal entries newer than it. The table holds **42** rows
  against **39** journal entries (drift from an earlier journal state), which is harmless — but it means
  any future journal squash with older timestamps would silently apply nothing.
- Minor: CI containers run **pg17**, local and prod run **pg18**. A migration relying on pg18-only
  syntax would pass locally and fail in CI, or worse, the reverse.

---

## Phases

Expand → migrate → contract. The order is load-bearing: making the FK `NOT NULL` **before** the loader
stops writing nulls would break ingest on the first content change.

### Phase 0 — migration hygiene (blocks everything below)

Nothing in this migration should be written until the folder stops lying, because every phase below adds
a file to it.

1. **Resolve `0039`.** Owner asked whether it can simply be applied now. The read-only inventory the
   release gate requires was run against prod on 2026-08-07 and says **no** — see below. Recommended
   action is therefore to move it out of `libs/database/migrations/` (proposed: `libs/database/gated/`,
   referenced from the release-gate doc) so the folder contains only files that will run, and to reopen
   the underlying product question separately.

#### `0039` inventory — production, read-only, 2026-08-07 (aggregates only, no PII)

| Fact | Value |
|---|---|
| subscriptions total | 50 |
| **unowned (`user_id IS NULL`)** | **33 (66%)** |
| unowned and active | 22 |
| unowned that received a digest in the last 14 days | **24** |
| owned and active | 9 |
| unowned linkable to an existing user via Telegram identity | **0** |
| dependent rows that would cascade-delete | 3 574 notifications + 1 080 deliveries |
| unowned created between | 2026-06-06 → 2026-07-29 |
| users in the system | 21 |

These are not legacy junk. They are the majority of the live Telegram audience — 24 people were
delivered to in the last two weeks against 9 owned active subscriptions — created over the last two
months, and **none of them can be backfilled**: not one has a matching Telegram auth identity, because
the deep-link flow (`?start=<id>`) creates a subscription without any web account. That is the documented
design (`schema/subscriptions.ts`: "legacy chat-only rows stay null"), and it is the primary acquisition
funnel.

So `user_id NOT NULL` is not a cleanup — it is a **product decision** that every subscriber must first
register, and the current product contradicts it. Applying it requires either deleting ~66% of
subscriptions (and ~24 live recipients) or building an account-claim flow first. Neither is a migration
concern.

**Recommendation:** retire `0039` rather than gate it indefinitely, and decide the product question on
its own terms. If the answer later becomes "yes, every subscription needs an owner", the migration is
one line and can be regenerated then — the file is worth nothing, the decision is worth everything.
2. **Guard the journal.** A ~15-line script asserting `set(*.sql basenames) == set(journal tags)`, wired
   into the existing CI lint job. This is the check that would have caught 0039 the day it landed.
3. **Automate local.** `pnpm db:migrate` runs as part of the dev startup path, so local matches the
   "never think about it" property prod already has.

**DoD 0 — done 2026-08-07 (uncommitted)**
- [x] `libs/database/migrations/` and `meta/_journal.json` agree — `pnpm db:check`: *39 files, all
      registered, order sane*.
- [x] A mismatched file makes the check red — verified by planting an orphan `.sql` and seeing it fail,
      then pass again after removal.
- [x] Guard wired into CI as the **first** step of the build job, before anything slow.
- [x] Local automation: `pnpm dev` / `pnpm dev:etl` now run `db:migrate` before starting, so local gets
      the "never think about it" property prod already has. `pnpm db:migrate` verified clean.
- [x] `0039` retired to `libs/database/gated/` (owner decision: skip). Runs nowhere; `drizzle.config.ts`
      `out` points only at `migrations/`, so `db:generate` cannot pick it up. Both referencing docs
      updated with the inventory and the reason.
- [x] Bonus catch: the guard immediately found `0003_rss_ingests_workflow_run_id` carrying a hand-written
      `when` far below its neighbours. Applied everywhere long ago, so it is pinned as a known historical
      exception rather than rewritten — any **new** violation still fails.

### Phase 1a — expand (purely additive, no behaviour change)

> **Scope changed during implementation.** The column rename (`first_seen_at` → `first_published_at`,
> `last_seen_at` → `last_published_at`) was **pulled out of 1a** for two independent reasons, and now
> has its own step, 1d.
>
> 1. **It is not backwards compatible.** Railway runs the migration in `preDeployCommand`, i.e. while
>    the *previous* container is still serving. A rename breaks that container's queries until the new
>    version is live. Everything else in 1a is additive and therefore genuinely invisible — mixing a
>    rename in would have quietly falsified this phase's "no behaviour change" claim.
> 2. `drizzle-kit generate` requires an interactive TTY to resolve a rename ("created or renamed from
>    another column?"), and answering that prompt blind risks generating `DROP COLUMN`. It needs a human
>    at a terminal, which is a fine reason to make it its own deliberate step.
>
> The misnomer is annotated in `schema/unique-vacancies.ts` so nobody builds a cohort on `first_seen_at`
> in the meantime.

Shipped as `0039_tiresome_adam_destine.sql` — generated by `pnpm db:generate` (so it is journal-registered),
with the backfill hand-appended to the same file, because a column that ships empty is a trap:

- `vacancies.deduplicated_at timestamptz` — NULL = not resolved yet, a timestamp = resolved and when.
- `unique_vacancies.first_loaded_at timestamptz` — `MIN(loaded_at)`, the only bump-proof time axis.
- `unique_vacancies.representative_vacancy_id uuid → vacancies(id)`.
- `vacancies_pending_dedup_idx` — partial, `WHERE deduplicated_at IS NULL`: the work queue is a handful
  of rows against the whole table, so the index stays tiny.
- `unique_vacancies_last_seen_idx` — serves both the freshness predicate and date sorting.
- Backfill: `deduplicated_at = updated_at` for everything already grouped; `first_loaded_at` and
  `representative_vacancy_id` from two named CTEs (`member_agg` + `representative` via `DISTINCT ON`),
  one pass each.

**DoD 1a — done 2026-08-07 (uncommitted)**
- [x] Generated, not hand-written: `pnpm db:check` → *40 files, all registered, order sane* (journal idx 39).
- [x] SQL reviewed before applying: purely additive, no `DROP`, no rename.
- [x] `pnpm db:migrate` clean on the dev DB.
- [x] Post-migration invariants, all **0**: groups missing `representative_vacancy_id`; groups missing
      `first_loaded_at`; representatives that are not members of their own group;
      `first_loaded_at` disagreeing with `MIN(loaded_at)`; postings left without `deduplicated_at`.
- [x] `pnpm --filter @metahunt/database build` + `etl lint` clean.
- [x] `pnpm test:etl:int` green with **no source changes** — 16 suites, 107 tests, 25s. The suite builds
      its schema from the real migrations on a fresh container, so this also proves the migration applies
      from zero. 1a is invisible, as claimed.
- [ ] Applies cleanly on a **restored copy of the prod dump**, not only the dev DB (prod is 1.6× larger
      and the dev snapshot is stale — see pre-flight).

### Phase 1d — the rename (its own deploy, human at a terminal)

`first_seen_at` → `first_published_at`, `last_seen_at` → `last_published_at`. Not backwards compatible,
so it ships alone, and `pnpm db:generate` must be run interactively: answer **"rename column"**, not
"create column", to both prompts, then review the SQL for any `DROP COLUMN` before applying.

Optional, and honestly cosmetic — but the current names actively invite the mistake the whole migration
exists to prevent, so it is worth one deploy on its own.

### Phase 1b — pipeline writes the new truth

- `VacancyRepository.update`: instead of `uniqueVacancyId: null`, keep the FK and set
  `deduplicatedAt: null` (still clearing `embedding*` and `dedupReason`). A content change no longer
  orphans the posting from its group; it only re-opens it for re-resolution.
- New postings: create a singleton `unique_vacancies` row in the same insert transaction, so the FK is
  populated from birth. `vacancy_count = 1`, `source_count = 1`, rollups from the posting itself.
- `DedupService`: work queue becomes `WHERE deduplicated_at IS NULL`. Resolving stamps `now()`; the
  merge path must **delete the vacated singleton group** (this is the new garbage — a merged-away group
  of one).
- **One shared rollup statement** replaces the two divergent ones (see the drift below). Both
  `DedupService` and `VacancyRepository.repairCluster` call it; it is the only place group aggregates
  are computed.
- The rollup gains `representative_vacancy_id` and `first_loaded_at`. Same subquery, no extra scan.

#### The drift being fixed

| Writer | Sets | Definition | Member filter |
|---|---|---|---|
| `dedup.service.ts:560` | `last_seen_at` only | `MAX(published_at)` | `embedding IS NOT NULL` |
| `vacancy.repository.ts:186` | both | `COALESCE(MIN/MAX(published_at), MIN/MAX(loaded_at))` | all members |

Two writers, two meanings, one column, no test that would notice. This is the concrete reason the
reconciliation query below becomes a scheduled check and not just a test assertion.

**DoD 1b**
- [ ] `unique_vacancy_id IS NULL` count stays 0 through a full ingest → embed → resolve cycle on dev.
- [ ] No orphan groups: `SELECT count(*) FROM unique_vacancies u WHERE NOT EXISTS (SELECT 1 FROM vacancies v WHERE v.unique_vacancy_id = u.id)` = 0 after a resolve run.
- [ ] `vacancy_count` / `source_count` match reality for every group (reconciliation query, see below).
- [ ] Re-running the sweep twice changes nothing (idempotency).

### Phase 1b.1 — reconcile pre-existing rollup drift

The shared 1b writer prevents new divergence but does not revisit a group that
does not receive another content update. Production pre-flight found 863 such
groups with a stale `last_seen_at` (and 853 with a stale `first_seen_at`) from
the two former writers. `0040_reconcile_position_rollups.sql` is a generated
custom migration that recomputes every denormalized group field once from all
members, using the same definition as the shared writer. It must land before
the 1c contract migration, so the invariant is true for the historical corpus
as well as new rows.

### Phase 1c — contract

This is two deploys because `vacancies` and `unique_vacancies` have an
intentional creation cycle:

1. **1c.0 — deferred FKs + atomic loader.** Make the cyclic FKs `DEFERRABLE
   INITIALLY DEFERRED` and deploy a loader that preallocates both UUIDs and
   inserts the singleton pair in one transaction. This is backwards
   compatible with the nullable column and gives the old container a safe
   overlap window.
2. **1c.1 — NOT NULL.** Only after a full production ingest through 1c.0,
   change the vacancy FK to `NOT NULL` (and replace its `SET NULL` delete
   action). At that point both the old and new containers create the pair
   atomically, so Railway's pre-deploy migration cannot strand a new posting.

```sql
ALTER TABLE vacancies ALTER COLUMN unique_vacancy_id SET NOT NULL;
```

Ships only after 1b has run in production for at least one full ingest cycle and the invariant query
above reports 0. Separate migration, separate deploy — this is the irreversible-ish step.

**DoD 1c**
- [ ] Invariant verified on prod **before** the migration runs, not after.
- [ ] Ingest survives a forced content-change replay (the path that used to write null).

### Phase 2 — read path

Two independent changes; do not conflate them.

**2a — grain.** Delete `coalesce(v.unique_vacancy_id, v.id)` everywhere. No new constant is needed —
the column is now `NOT NULL`, so the plain FK *is* the position key.

| File | Change |
|---|---|
| `market/market.service.ts` | count positions, not postings; distributions read the representative |
| `feed/facets.service.ts` | skills / roles / domains → position grain (company facet drops its `coalesce`) |
| `feed/feed.service.ts` | `PARTITION BY v.unique_vacancy_id`; total drops its `coalesce` |
| `03-discovery/ranking/ranking.service.ts` | same partition simplification |
| `03-discovery/tracks/tracks.repository.ts` | counts → position grain |

**2b — freshness as a filter (ADR-0013).** No `active` concept is introduced.

- `FeedSearchParams.postedWithinDays` already exists (today: sitemap-only, and it filters the
  *posting's* `coalesce(published_at, loaded_at)`). Re-point it at the group's `last_published_at` and
  expose it in `feed.contract.ts` as a normal filter.
- Feed UI: default 30 days, rendered as a **removable chip**, so "all time" is one click away.
- Date sort switches to the group's `last_published_at` — otherwise a repost sorts inconsistently with
  the window that filtered it.
- Market aggregate stays **all-time**. Only its caption changes: it must carry the unit and the corpus
  span (`"8 631 позицій · з 1 травня 2026"`), never a window it does not apply.
- SEO surfaces (role hubs, `listForSitemap`) stay all-time — unchanged behaviour, now on the right grain.

**DoD 2**
- [ ] `grep -rn "coalesce(.*unique_vacancy_id" apps/` returns nothing.
- [ ] Market total equals the feed total **when the feed carries the same filters** (no window, no
  facets) — asserted in an int test. With the default 30-day chip on they legitimately differ.
- [ ] Every user-facing number renders its scope: unit + window + `as_of`. Checked on landing, `/match`,
  OG image, `HowItWorks`.
- [ ] Removing the 30-day chip returns the all-time count, and it matches the market total.
- [ ] `pnpm seo:audit` still passes and sitemap volume does not drop.

### Phase 3 — digest de-dup by position

`sentVacancyIds*` and the feed's `excludeIds` move from `vacancies.id` to the group. Closes the
"same position re-sent from another source" gap. Small, but it changes what users receive, so it ships
on its own.

### Phase 4 — deferred, explicitly not in this branch

- Merged skill set per position + salary range across members → only when Fit scores per position.
- `node_stats` / `node_skill_cooc` on the position grain → **ADR-0014 required**, with before/after
  match output on real CVs. Changes ranking; must not ride along.
- Source-absence expiry (real closure detection) → ADR-0013 Option A, once polling is trustworthy.

---

## Integration tests to write **before** the code

All under `apps/etl/test/int/`, real Postgres via `makeTestDb` (the existing pattern in
`dedup.int.spec.ts`, orthogonal-embedding fixtures, stubbed OpenAI client).

| Test | File | Asserts |
|---|---|---|
| new posting gets a singleton group | `vacancy-loader.int.spec.ts` | FK non-null immediately after insert; `vacancy_count = 1`; rollups = the posting's own timestamps |
| content change re-opens without orphaning | `vacancy-loader.int.spec.ts` | after update: FK unchanged, `deduplicated_at IS NULL`, embedding cleared |
| merge collapses two singletons | `dedup.int.spec.ts` | one group left, `vacancy_count = 2`, `source_count = 2`, vacated group gone, `representative_vacancy_id` is the newest member |
| rollups track the group max | `dedup.int.spec.ts` | `last_published_at` = newest member; adding an older member does not move it |
| both writers agree | `dedup.int.spec.ts` | resolve path and `repairCluster` produce byte-identical rollups for the same group (the drift bug) |
| bump does not move first-appearance | `vacancy-loader.int.spec.ts` | source bumps `published_at` on update → `last_published_at` moves, `first_loaded_at` does not |
| sweep is idempotent | `dedup.int.spec.ts` | second run: zero writes, identical counters |
| **header equals list** | `feed.int.spec.ts` | market total == feed total when the feed carries no filters (the regression that started all this) |
| window filters, does not delete | `feed.int.spec.ts` | group with a 31-day-old newest member: absent with `postedWithinDays=30`, present without it, and counted in the market total either way |
| repost re-enters the window | `feed.int.spec.ts` | old member + fresh repost → group passes a 30-day filter (group max, not member) |
| date sort uses the group | `feed.int.spec.ts` | group ordering follows `last_published_at`, not the representative's own timestamp |
| digest does not re-send a position | `digest-fixture.int.spec.ts` | member A sent, member B of the same group is excluded (Phase 3) |

Reconciliation query — becomes an int-test assertion now and a scheduled check later:

```sql
SELECT u.id
FROM unique_vacancies u
JOIN (
  SELECT unique_vacancy_id AS id,
         count(*) AS n, count(DISTINCT source_id) AS s,
         max(coalesce(published_at, loaded_at)) AS last_pub
  FROM vacancies GROUP BY unique_vacancy_id
) r USING (id)
WHERE u.vacancy_count <> r.n
   OR u.source_count  <> r.s
   OR u.last_published_at IS DISTINCT FROM r.last_pub;
-- expected: 0 rows
```

---

## Rollback

- **1a** — additive; revert = drop columns/type. Safe.
- **1b** — code-only; revert the deploy. The `deduplicated_at` column stays and is simply unread; nulls
  reappear and the old `IS NULL` queue works again. **This is why 1b and 1c are separate deploys.**
- **1c** — `DROP NOT NULL` is instant and safe. The genuinely irreversible part is none of the above;
  no data is destroyed at any phase.
- **2** — code-only.

## Risks

| Risk | Mitigation |
|---|---|
| Loader/dedup are the highest-traffic write paths | tests before code; 1b and 1c split across deploys |
| Merged-away singleton groups accumulate | explicit delete in the merge path + reconciliation query in CI |
| Landing (all-time) and feed (30d default) show different numbers and read as a bug | both carry their scope in the caption; DoD 2 checks every surface |
| A concurrent worktree touches the same files | none of the 3 dirty worktrees do today — re-check before merge |
| `db:migrate` silently skips the migration | DoD 1a explicitly greps the journal (the 0039 lesson) |

---

## What we do now, and what comes later

**Now (this branch):** Phase 0 (migration hygiene) → Phases 1a → 1b → 1c → 2. One definition of position; freshness stays a filter,
not a concept; read paths corrected; every number carries its scope. No matview, no new service, no
analytics infrastructure, no `active` state.

**Deliberately deferred, decided:** operator unlinking (`detached_at`, when an admin surface exists) and
real closure detection. Closure will be a mix of passive (age) and active (source says so) signals that
differ per source, so the trigger for building it is left to be decided from lab evidence rather than
guessed now.

**Next, separately:** Phase 3 (digest by position), then ADR-0014 for the IDF regrind with before/after
evidence.

**Only after that:** the data lab. Running it before Phase 2 would profile the posting grain and produce
a readiness assessment and an experiment roadmap built on the number we are currently fixing. Two
additions to `metahunt-data-lab-agent-prompt.md` once this lands:

1. PHASE 10 — every metric declares its grain (`posting` | `position`) and denominator; a posting-grain
   number presented as a market claim is an error, not a style choice.
2. PHASE 3 — add a 14th fitness category: **freshness / liveness**, since without `active` every trend
   measures the archive.

**Not planned:** a separate analytics microservice. The boundary it would follow is exactly
`vacancies` (what we were sent) vs `unique_vacancies` (what the market is) — which is what this
migration draws inside one database. Revisit only when a second writer or a second store exists.
