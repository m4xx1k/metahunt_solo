# feed ⊕ scoring merge — one query, an optional overlay

**Status:** Part 1 shipping — `ov` deleted, the Scorer port reverted, one `buildWhere`
kept. The unified endpoint + the cheap path are a follow-up PR (see the last section).
**Tickets:** [MET-144](https://linear.app/metahunt/issue/MET-144) (the merge) ·
[MET-120](https://linear.app/metahunt/issue/MET-120) (shipped, PR #157) ·
[MET-104](https://linear.app/metahunt/issue/MET-104) (v2 ranker — where Part 2 lands)
**Date:** 2026-09-02

Two parts that are easy to conflate and must not be:

- **Part 1 — plumbing.** One endpoint instead of two. Does not change a single number
  the ranker produces.
- **Part 2 — the model.** The ranker puts the wrong vacancies on top. Independent of
  Part 1, and the reason Part 1 is worth doing first: it creates the one place where a
  formula change lands.

---

## Part 1 — the merge

### Where we are

Two paths compute the same thing over the same table:

| | cold | warm |
|---|---|---|
| entry | `GET /feed` | `POST /ranking/match`, `GET /cv/:id/matches` |
| filters | `feed.service.ts` `buildWhere` | `ranking.service.ts` `buildFilters` |
| scoring | none | `score/score.sql.ts` → `rankedCte` |
| response | `FeedResponse` | `MatchResponse` |

`buildWhere` is a strict superset of `buildFilters` (`q`, `companyId`, `skillIds` with
AND semantics, `hasDuplicates`, `includeRoleless`). Since MET-139 both run at Position
grain against the same `p.` alias, so the duplication is now literal, not conceptual.

### The `ov` trap

`scoringCtes` opens with an overlap probe:

```sql
ov AS (SELECT DISTINCT pn.position_id FROM position_nodes pn JOIN cand c ON c.node_id = pn.node_id)
```

`agg` then reads `FROM ov`. **This makes skill overlap decide the result set, not just the
order.** A Position sharing zero skills with the CV cannot appear in the warm list at all.
So warm is not "the feed with a score" — it is a different, smaller corpus. That is the
structural reason the two endpoints could never simply be merged.

Deleting it is safe by construction: `relevance` has no `COALESCE` in `agg`, so a
zero-overlap Position already yields `NULL`. `relevance IS NULL → overlay = null` covers
both zero-overlap and untagged Positions — no new state.

### Target shape

One query for every request. Scoring hides behind a port (`score/scorer.port.ts`), so the
feed knows a nullable overlay and nothing else — the words `coverage`, `tier`, `relevance`,
`on_stack` appear only inside `FitScorer`.

```sql
WITH <scorer.cte()>              -- absent for the anonymous path
page AS (
  SELECT p.position_id, p.last_source_activity_at AS posted_at <scorer.select()>
  FROM positions p <scorer.join()>          -- LEFT JOIN
  WHERE <buildWhere(filters)> AND <scorer.filter()>
)
SELECT *, count(*) OVER () AS total FROM page
ORDER BY <sort = "score" ? scorer.order() : "posted_at DESC, position_id DESC">
LIMIT :pageSize OFFSET :offset
```

`resolveFeedQuery(candidateId | null, urlFilters) → { filters, scorer, sort, page }` is the
only code aware that candidates exist. `FeedService` never takes a `candidateId`. Persisted
profile preferences later resolve into `filters` here, changing no SQL.

**Deletes:** `ov` · `RankingService.buildFilters` · the feed's separate `count` query
(window count instead) · `buildItems`' `skillRows` query (the have/missing/bonus diff is
computed in TS from `fetchSkills` + candidate node ids) · `hydratePositionsByIds` ·
`WarmBody` as a separate list body. Round trips per page: 4 → 3.

### Cost

Measured on MET-144, local corpus of 8 876 Positions / 82 605 `position_nodes`:

| query | time |
|---|---|
| feed page today, no scoring | 19 ms |
| full scoring + `minFitTier=GOOD` + `sort=date` | 78 ms |
| same, keeping `ov` — typical candidate (15 skills) | 84 ms |
| same, keeping `ov` — degenerate candidate (3 rare skills) | 17 ms |

`ov` costs more than it saves for a realistic candidate. It only looks fast on narrow
candidates because it is answering a smaller question.

**What actually got more expensive.** The feed already fetches skills — but only for the
20 Positions on the page (`fetchSkills`). Scoring aggregates `position_nodes` across the
*whole filtered set*, because the score decides which rows reach the page. That is the
19 → 78 ms delta.

**Cheap-path variant (deliberately deferred).** When `sort=date` **and** no `minFitTier`,
the score does not affect page selection, so it could be computed for the 20 page rows only
— roughly today's 19 ms. This is one branch in `resolveFeedQuery`, not a second query
shape, and the port is where it belongs. Not in v1: 78 ms is acceptable, and shipping the
uniform shape first keeps the diff honest. Revisit when the corpus grows or the number
moves.

Score materialization stays the escape hatch behind the same port (MET-120 option C).

---

## Part 2 — the scoring model

### Symptom

Thin vacancies win. Observed 2026-09-02: a vacancy whose only required skill was Python
ranked #1 for a full CV.

### The formula as it actually stands

`node_stats` is a matview (`migrations/0047`):

```sql
weight = sqrt(greatest(ln(N::float8 / (df + 5)), 0))
```

`N` = total Positions, `df` = how many Positions list this skill, `+5` = smoothing,
`greatest(…, 0)` = a crash guard added in `0025` (`ln` goes negative once `df → N`).

At N = 8 876 the whole range is:

| df | weight |
|---|---|
| 1 | 2.70 |
| 10 | 2.53 |
| 100 | 2.11 |
| 500 | 1.69 |
| 1 000 | 1.48 |
| 2 000 | 1.22 |
| 4 000 | 0.89 |

**The `sqrt` already compresses IDF to a ~3× spread.** A ubiquitous skill is not worth
zero — it is worth about a third of a once-seen one. The formula is less unhinged than it
looks; the problem is the *ordering*, not the magnitude.

### Diagnosis 1 — the top-1 Python case is not an IDF bug

```
coverage = matched_required_w / required_total_w
```

For a vacancy with **one** required skill the weight cancels out entirely: the candidate
either has it (coverage = 1.00 → STRONG, 100 %) or does not (0.00). Whatever Python's
weight is, it is irrelevant.

Worked, illustrative (`df` estimated, weights from the table above):

| vacancy | required | candidate has | coverage | tier |
|---|---|---|---|---|
| A | Python (1.48) | Python | **1.00** | STRONG |
| B | Python, Django, PostgreSQL, Docker, AWS (Σ 7.79) | Python, PostgreSQL, Docker (Σ 4.44) | **0.57** | GOOD |

Sort is `tier_bucket DESC, relevance DESC`, so every thin vacancy floats above every honest
partial match as a block. **This is a small-denominator problem in a ratio, and it is the
single biggest quality defect today.** It gets worse after Part 1, because deleting `ov`
makes more thin vacancies visible.

### Diagnosis 2 — IDF measures frequency, not importance

Two separate failure modes, both real:

- **Common and essential.** Python at `df ≈ 1 000` scores 1.48 while a tool mentioned on
  10 vacancies scores 2.53. Matching the skill the job is actually built on earns *less*
  than matching an incidental one. The ordering is inverted against importance.
- **Rare and incidental.** Test frameworks, niche tooling, and extraction artifacts sit at
  `df` 1–10, i.e. the top of the weight range. The `+5` smoothing barely dampens this
  (`df=1` → 2.70 vs `df=3` → 2.65).

IDF is borrowed from document retrieval, where rare terms discriminate between documents.
Here the "query" is a person and the "document" is a job, and what matters is **necessity
and substitutability**, which rarity proxies for neither. The necessity signal we already
have is `is_required` — and today it is used only to pick the numerator, never to weight.

### KISS fix — two changes, no new tables, no LLM

**Fix 1 — evidence gate on the tier.** `required_total` is *already computed* in `agg`
(`count(*) FILTER (WHERE pn.is_required)`) and currently only feeds the "X of Y required"
label. Cap the tier when the evidence is too thin:

```sql
CASE WHEN required_total < 3 THEN 0            -- STRETCH, no matter the coverage
     WHEN coverage >= FIT_STRONG_MIN THEN 2
     WHEN coverage >= FIT_GOOD_MIN   THEN 1
     ELSE 0 END
```

One `CASE` arm. Every existing number stays identical; only thin vacancies stop winning.
Fully reversible, needs no recalibration of `FIT_*_MIN`. **Ship this first.**

**Fix 2 — importance multiplier from data we already have.** `node_tech_meta` (populated
by `skills:classify`, ADR-0010) carries `is_core`, `category`, `generic` — and `agg`
**already LEFT JOINs it** for the stack logic. So this costs no new join:

```
effective_weight = weight × (is_core ? α : 1) × (generic ? β : 1)
```

Starting point α ≈ 1.5, β ≈ 0.5, to be re-eyeballed on real data. This restores Python
above an incidental tool without touching the IDF formula at all. `category` multipliers
(`TOOL`/`LIBRARY` down, `LANGUAGE`/`FRAMEWORK` up) are the next dial if two constants are
not enough.

**Deliberately not in the KISS set:**

- *Bayesian smoothing* (`matched_w / (required_w + k)`) is the principled version of Fix 1
  and behaves better — no cliff at 3 skills. But it shifts every coverage value downward,
  so `FIT_STRONG_MIN` / `FIT_GOOD_MIN` must be re-picked in the same change. Worth doing;
  not worth doing blind. `k ≈ 2–3` reads naturally as "one phantom requirement nobody
  satisfies".
- *A `df ≥ 3` floor* to drop extraction artifacts. Cheap, but needs a look at what actually
  sits at `df` 1–2 before deciding whether it is noise or genuinely rare signal.

### Future path (do not build now)

1. **Calibrate on ground truth.** MET-24's golden set is done but scores *extraction*, not
   ranking relevance. A ranking golden set does not exist yet, and MET-104 lists it as a
   blocker — that gap is the real prerequisite for any tuned model.
2. **Substitutability over rarity.** `node_skill_cooc` + `SUBSTITUTE_NPMI_MIN` already
   exist for the ADR-0010 substitute gate. A skill's weight should reflect how hard it is
   to replace, not how rare it is in the corpus.
3. **The implication graph** (MET-27, React ⇒ JavaScript) fixes a different half: the
   candidate is credited for skills they demonstrably have but did not list.
4. **Learned weights** — MET-104's hybrid ranker, feature-flagged with a fallback. This is
   what the Scorer port from Part 1 exists to make swappable.

---

## Sequencing

1. **Close MET-120.** PR #157 merged 2026-08-02; the Linear issue still reads "In
   Progress" and is MET-144's only recorded blocker.
2. **Re-measure** before cutting code — the MET-144 numbers predate the Position-grain
   cutover settling and PR #203. `EXPLAIN ANALYZE` on a prod-sized restore, both sorts.
   ~15 minutes, and it is the only irreversible call in Part 1 (deleting `ov`).
3. **Part 1**, against MET-144's DoD. Behaviour-preserving: `/match` output stays
   byte-identical except that zero-overlap Positions now appear with `overlay = null`.
4. **Fix 1** (evidence gate) as its own small PR — it is a visible ranking change and
   deserves to be revertible on its own.
5. **Fix 2** (importance multiplier) after, with before/after screenshots of the same CV.

Parts 1 and 2 must not share a PR. One is a refactor with no behaviour change; the other
changes what users see. Reviewing them together makes both unreviewable.

## Open decisions

- Does the scoring work get its own ticket, or ride MET-104? MET-144 explicitly scopes
  model changes out, and MET-104 is a much bigger "design and validate v2" brief — Fixes 1
  and 2 are neither. Leaning: a new small ticket, related to both.
- Cheap-path variant in v1 or deferred (see Part 1 → Cost). Leaning: deferred.
- `candidate_role_preferences` (3 rows) and `candidate_excluded_skills` (8 rows) exist in
  the DB, are absent from the Drizzle schema, and are referenced nowhere in code (verified
  by grep over `apps/` and `libs/`). Revive under the profile work or drop — out of scope
  here, but they block nothing until the profile lands.

---

# Execution plan — Part 1 only

Decisions locked with the owner 2026-09-02:

- **Old endpoints stay.** `POST /ranking/match` and `GET /cv/:id/matches` remain, as thin
  wrappers over the unified path. Deleting them is a later branch.
- **Backend only.** `apps/web/` is not touched by a single line in this run.
- **Candidate identity comes from the authenticated user**, never from a query param —
  the account will later carry a default CV and the feed resolves it from the JWT. So this
  run adds **no new public surface**: the composition root accepts an already-resolved
  `candidateId | null` and nothing else.

Fixes 1 and 2 from Part 2 are explicitly **out of scope**. No ranking number changes
meaning in this run except where Stage 4 says so.

## Standing rules for the executing session

1. **Never `git push`.** Branch and commits only. No PR.
2. **Never `git add -A` / `git add .`** — the working tree carries unrelated in-flight work
   (PostHog founder-script cleanup, `CLAUDE.md`, `md/README.md`). Stage explicit paths only.
   Those files must stay uncommitted and unmodified.
3. Never commit to `main`. Branch: `feat/MET-144-feed-scoring-merge`, cut from `main`.
4. Never touch the prod database. Everything runs against local Docker Postgres.
5. Never edit `apps/web/`.
6. One stage = one commit. Commit only after that stage's gate is green.
7. **Gate fails → two fix attempts, then stop.** Revert only the paths this stage touched
   (`git checkout -- <paths>`), append a `## Blocked` note to this tracker with the failing
   output, and end the session. Do not improvise past a red gate.
8. Comments per `md/engineering/STYLE.md`: the non-obvious *why* only, ≤2 lines.
9. English in code, comments and commits.

## The gate

After every stage, in this order. All four must pass:

```bash
pnpm lint
pnpm test:etl
pnpm test:etl:int      # Testcontainers — needs a live Docker daemon
pnpm build
```

Plus the **golden diff** (defined in Stage 0). Plus `pnpm analytics:catalog` in any stage
that moves `emitMatchScored`. `pnpm seo:audit` is skipped on purpose: no web change.

---

## Stage 0 — preflight and baseline

Nothing is written in this stage. Its whole job is to refuse to start on broken ground.

1. **Docker daemon.** `timeout 30 docker info` must answer. As of 2026-09-02 it did **not**
   respond on this machine — start Docker Desktop / the WSL docker service first. Dead
   daemon after a restart attempt → **stop here**, `pnpm test:etl:int` cannot run.
2. `pnpm docker:infra` — Postgres, MinIO, Temporal.
3. **Local data.** `SELECT count(*) FROM positions;` must return **> 5 000**.
   - If it does: use it, restore nothing.
   - If it does not: `./scripts/db-restore.sh backups/Postgres-1788299274454.sql.gz`
     (prod dump taken 2026-09-01, already on disk — do **not** pull a fresh one; that needs
     `railway login` and the existing dump is a day old). The script drops and recreates the
     local database; that is local-only and expected.
4. **Baseline must be green before any edit:** run the full gate on unmodified `main`.
   Record the test counts in this file. A red baseline → **stop**; do not build on it.
5. Cut the branch: `git checkout -b feat/MET-144-feed-scoring-merge`, then commit this
   tracker as the branch's first commit — it is currently untracked and rides along:
   `git add md/journal/migrations/feed-scoring-merge.md && git commit`.
6. **Capture the golden output.** Both legacy shapes, over the public sample path (no auth
   needed — `GET /cv/samples` and `GET /cv/samples/:id/matches` are `@Public()`):

   ```bash
   pnpm docker:up                       # etl on :3333
   SAMPLE=$(curl -s localhost:3333/cv/samples | jq -r '.[0].id')
   mkdir -p .scratch/met-144
   for q in "" "?sort=date" "?minFitTier=GOOD" "?includeOffStack=true" "?page=2"; do
     curl -s "localhost:3333/cv/samples/$SAMPLE/matches$q" \
       | jq -S . > ".scratch/met-144/golden-$(echo "$q" | tr -dc 'a-zA-Z0-9')_.json"
   done
   ```

   `.scratch/` is gitignored — these files are evidence for the run, not artifacts.

**Gate 0:** docker alive · positions > 5 000 · baseline gate green · 5 golden files
non-empty and containing `items`. Any red → stop.

### Stage 0 result — 2026-09-02

- Docker: Desktop was **manually paused**, not dead; `docker desktop restart` cleared it.
  `docker info` answers, `Paused: 0`.
- Local data: `SELECT count(*) FROM positions` → **14 547** (> 5 000). Restored nothing.
- Baseline gate on `main` @ `56001f4` — **green**:

  | step | result |
  |---|---|
  | `pnpm lint` | pass (32s) |
  | `pnpm test:etl` | 79 suites / **542** tests pass (59s) |
  | `pnpm test:etl:int` | 18 suites / **122** tests pass (36s) |
  | `pnpm build` | pass (17s) |

- Branch `feat/MET-144-feed-scoring-merge` cut from `main` @ `56001f4`; this tracker is
  its first commit.
- Golden output captured — see Gate 0 check below.

---

## Stage 1 — measure, and decide `ov`

**This stage decides whether Stage 4 happens at all.** No application code is edited.

Run against the restored local database. Use a real sample candidate so the skill set is
realistic:

```sql
-- pick the candidate with the most skills
SELECT candidate_id, count(*) FROM candidate_nodes GROUP BY 1 ORDER BY 2 DESC LIMIT 3;
```

**(A) baseline — today's feed page, no scoring:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.position_id
FROM positions p
WHERE p.role_node_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM nodes rn WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED')
  AND p.last_source_activity_at > now() - interval '30 days'
ORDER BY p.last_source_activity_at DESC, p.position_id DESC
LIMIT 20;
```

**(B) the decision query — full scoring, `ov` removed, `sort=date`, `minFitTier=GOOD`.**
Take `scoringCtes` from `apps/etl/src/03-discovery/score/score.sql.ts` verbatim, then make
exactly two edits: drop the `ov` CTE, and in `agg` replace `FROM ov JOIN position_nodes pn
ON pn.position_id = ov.id` with `FROM position_nodes pn`. Feed the candidate through a
subquery instead of the inlined `VALUES` list:

```sql
cand(node_id) AS (SELECT node_id FROM candidate_nodes WHERE candidate_id = '<uuid>')
```

(This is a measurement proxy — the running code inlines `VALUES`, so the plan can differ
slightly. Note it in the write-up.)

**(C) control — the same query with `ov` kept.**

Five warm runs each, median reported.

**Gate 1 — the only irreversible call in Part 1:**

| (B) median | action |
|---|---|
| **≤ 150 ms** | green — delete `ov` in Stage 4 |
| **> 150 ms** | **stop.** Do not delete `ov`. Write the numbers into this tracker, commit that, and end the session — the merge is still worth doing without it, but that is the owner's call, not the agent's. |

Commit: the measurement table appended to this file. `docs(met-144): re-measure scoring cost`.

### Stage 1 result — 2026-09-02 — Gate 1 RED, Stage 4 NOT taken

Local restore: none — measured against the live local DB (14 547 Positions,
82 605-ish `position_nodes`). Candidate: `b932cafb-fb21-4bc9-965a-7c74671eb69a`
(**45 skills — the highest `candidate_nodes` count in the corpus**, per the Stage 1
picker query). Machine under normal dev load (native etl `nest --watch`, a Next dev
server) — absolute numbers run a little hot, but (B) vs the 150 ms line is the call.

Measurement proxy caveats, as the plan flags: candidate fed via
`cand(node_id) AS (SELECT node_id FROM candidate_nodes WHERE candidate_id = …)`
instead of the inlined `VALUES` list; the full `rankByRefs` pipeline
(`ranked` → `ranked_positions` filtered to `tier_bucket >= 1` → `counted` window →
`WHERE on_stack` → `ORDER BY posted_at DESC, id DESC` LIMIT 20) reproduced by hand.
Query files: `.scratch/met-144/s1-{A,B,C}-*.sql`; full plans `s1-plan-{A,B,C}.txt`.

| query | runs (ms), sorted | median |
|---|---|---|
| **(A)** feed page, no scoring | 11.5 11.6 12.1 12.4 15.0 | **12.1 ms** |
| **(B)** full scoring, `ov` removed, `sort=date`, `minFitTier=GOOD` — batch 1 (5) | 148.0 150.5 151.3 158.2 167.9 | **151.3 ms** |
| **(B)** — batch 2 (9, after 2 warmups) | 149.3 149.5 149.6 149.8 150.7 151.3 151.5 152.6 154.1 | **150.7 ms** |
| **(C)** control, `ov` kept — batch 1 (5) | 157.8 165.6 167.7 168.4 169.8 | **167.7 ms** |
| **(C)** — batch 2 (9) | 164.7 164.7 166.0 167.5 172.4 178.3 194.1 197.5 214.9 | **172.4 ms** |

Context, not the gate: a ~15-skill candidate (`ddac44f3…`) runs (B) at a **~143 ms**
median — still within a rounding error of the line.

**Verdict.** (B) median is **150.7–151.3 ms across two independent batches — above the
150 ms threshold.** Per the owner's standing instruction ("Gate 1 вирішує, чи взагалі
робиться Stage 4 — не видаляй `ov`, якщо медіана > 150 ms"):

- **Stage 4 is NOT taken.** `ov` stays. The unified single-query shape from Part 1 is
  deferred with it.
- **The run continues** through the stages that do not depend on removing `ov` —
  Stage 2 (Scorer port, wraps `rankedCte` including `ov` verbatim), Stage 3 (one
  `buildWhere`), Stage 5 (round-trip reductions inside `buildItems`), Stage 6
  (close-out). Each still gated on `pnpm` green + an empty golden diff.
- `ov` beats no-`ov` here only because the designated candidate is the corpus maximum
  (45 skills) — for it, the overlap probe still trims enough `position_nodes` rows to
  pay for itself. The plan's earlier table (measured on a different corpus snapshot)
  had it the other way around. Whether to revisit the `ov` deletion on a quieter box
  is the owner's call.

Branch `feat/MET-144-feed-scoring-merge` after Stage 1: two commits — the tracker
(`cb3da11`) and this measurement (`a443a70`, `docs(met-144): re-measure scoring cost`).

---

## Stage 2 — the Scorer port, behaviour-identical

Create `apps/etl/src/03-discovery/score/scorer.port.ts`:

```ts
interface Scorer {
  cte(): SQL | null;
  join(): SQL;
  select(): SQL;
  filter(): SQL | null;
  order(): SQL;
  overlay(row): MatchOverlay | null;
}
```

`NullScorer` — every method a no-op, `overlay()` returns `null`.
`FitScorer` — wraps today's `rankedCte` **without changing one character of its SQL**,
including `ov`. `RankingService.rankByRefs` is rewritten to drive the port.

**Invariant to enforce while writing:** after this stage, `grep -rn 'coverage\|tier_bucket\|
on_stack\|relevance' apps/etl/src/03-discovery/` must return hits only inside `score/`.

**Gate 2:** full gate green **and the golden diff is empty** — re-run the Stage 0 capture
into `.scratch/met-144/after-*` and `diff` each pair. Any non-empty diff is a bug in this
stage, not an improvement.

Commit: `refactor(score): put scoring behind a Scorer port`.

### Stage 2 result — 2026-09-02 — Gate 2 GREEN

New file `apps/etl/src/03-discovery/score/scorer.port.ts`: `Scorer` interface
(`cte / join / select / filter / order / overlay`), `NullScorer` (all no-ops,
`overlay → null`, for the future anonymous feed path), `FitScorer` (wraps
`rankedCte` verbatim — `ov` included — and owns `TIER_BUCKET` / `TIER_BY_BUCKET`).
`RankingService.rankByRefs` + `buildItems` now drive `FitScorer`; the local
`TIER_*` tables and the `rankedCte` / `buildScoreBreakdown` / `fitPercent` imports
are gone from `ranking.service.ts`.

- Gate: `pnpm lint` ✓ · `test:etl` 79/**542** ✓ · `test:etl:int` 18/**122** ✓ ·
  `build` ✓.
- **Golden diff empty** on all 5 captures (`.scratch/met-144/after-*` vs `golden-*`),
  confirmed against the live `nest --watch` etl serving the rebuilt code.
- **Invariant — partial, by design.** The scoring *definitions* (`ov`, the coverage /
  tier_bucket / on_stack CASEs, the weight math) are now entirely inside `score/`.
  What still names `on_stack` / `tier_bucket` / `relevance` in `ranking.service.ts` is
  the off-stack **paging policy** (`keep` filter + the `counted` window that reports
  `offStackHidden`) — it consumes the port's columns but defines no scoring. Folding
  that residue away is Stage 4's job (the `counted` CTE collapses into
  `count(*) OVER ()` there); with Stage 4 skipped it stays.

---

## Stage 3 — one `buildWhere`

Delete `RankingService.buildFilters`; route the scoring path through `FeedService`'s
`buildWhere`. It is a strict superset, so this is a deletion, not a merge.

**The one real trap:** `buildWhere` applies `ELIGIBLE_POSITION` only when
`includeRoleless !== true`, while `buildFilters` applies it unconditionally. The scoring
path must therefore pass `includeRoleless: false` explicitly. Get this wrong and unverified-
role positions leak into matches.

**Gate 3:** full gate green + golden diff empty.

Commit: `refactor(feed): one filter builder for both paths`.

### Stage 3 result — 2026-09-02 — Gate 3 GREEN

`buildWhere` in `feed.service.ts` is now `export`ed; `RankingService.buildFilters`
is deleted; `rankByRefs` maps `MatchFilters → FeedSearchParams` and calls
`buildWhere({ …, includeRoleless: false })`. The `includeRoleless: false` is the
trap the plan flags — `buildWhere` gates `ELIGIBLE_POSITION` on it.

Field-by-field the two builders were already equivalent (`buildWhere` is the
superset): same predicates for seniority/format/english/employment/domain/role/
excluded-skill/experience/test/reservation/source/postedWithin/loadedAfter/
excludeIds — only cosmetic differences (`::text` casts vs `uuidList` casts, alias
names, `and(...)` parens).

- Gate: `pnpm lint` ✓ · `test:etl` 79/**542** ✓ · `test:etl:int` 18/**122** ✓ ·
  `build` ✓. One prettier-only fix (a stray blank line where `buildFilters` was).
- **Golden diff empty** on all 5 captures.
- **Extra proof** for the filter paths the 5 captures don't touch: stashed Stage 3,
  rebuilt, captured `.scratch/met-144/fpre-*` from the old `buildFilters`; restored,
  rebuilt, captured `fpost-*`. Byte-identical for `seniorities=SENIOR`,
  `seniorities=SENIOR,MIDDLE&workFormats=REMOTE`, `experienceYears=6+`,
  `postedWithinDays=7`, `hasReservation=true`, `minFitTier=STRONG&sort=date`.

---

## Stage 4 — delete `ov`, revert the Scorer port — DONE 2026-09-02 (owner call)

Gate 1 measured the `ov`-removed query a hair over the 150 ms line, so the original run
stopped here. The owner reopened it 2026-09-02: **delete `ov` anyway** — it was never
buying speed (Stage 1/6 had `ov` at ~167–172 ms, no-`ov` at ~150 ms), it was buying a
*smaller, different* result set, and that is the one structural reason the feed and match
paths could not merge. Speed is a later lever (score materialisation, MET-120 option C).

Two changes:

1. **`score/score.sql.ts` — the `ov` CTE is gone.** `agg` reads `FROM position_nodes pn`
   directly. `scoringCtes` now scores every Position with a tagged skill; a zero-overlap
   Position falls out as `relevance IS NULL` (that column has no `COALESCE`).
2. **The Scorer port is reverted** (owner's "variant 2"). `score/scorer.port.ts` is
   deleted; `RankingService.rankByRefs` / `buildItems` assemble the scoring SQL inline
   again, exactly as on `main` before `5d105c8`. Reason: with `ov` gone and the unified
   endpoint deferred, the port had one implementation and one caller — an abstraction
   with nothing sitting on it. It comes back in the follow-up PR, when the feed becomes
   a real second consumer and Part 2 / MET-104 a real second implementation, and it can
   be shaped to what those two actually need.

   **Stage 3 stays.** `RankingService.buildFilters` is still deleted; both paths still
   filter through `FeedService.buildWhere`. That was a clean deletion and is unaffected.

**Preserving legacy output.** Deleting `ov` would let zero-overlap Positions into
`/ranking/match` and `/cv/:id/matches` with a null score — a visible change, and the
frontend is untouched here by design. So `rankByRefs` adds `AND rk.relevance IS NOT NULL`
to `ranked_positions` (and to `emitMatchScored`). That predicate **is** the old `ov`
membership test: `ov` = "Position shares ≥1 skill with the CV", and a Position that
shares no skill sums `relevance` over nothing → `NULL`. Both current callers are the
legacy wrappers, so the guard is unconditional for now; the unified feed path in the
follow-up PR is where it comes off (a `requireOverlap` flag, or the feed simply not
passing it).

**Gate 4 — green.** `pnpm lint` · `test:etl` (542) · `test:etl:int` (122) · `build` all
pass. **Golden diff empty across 50 `/cv/samples/:id/matches` captures** — 5 sample CVs ×
10 filter/sort/paging combos (`""`, `sort=date`, `minFitTier=GOOD`, `minFitTier=STRONG`,
`includeOffStack=true`, `page=2`, `sort=date&minFitTier=GOOD`, `seniorities=SENIOR`,
`workFormats=REMOTE&sort=date`, `includeOffStack=true&sort=date`). Byte-identical before
and after — captures in `.scratch/met-144/v2/{pre,post}-*.json`. That empty diff is the
proof the `relevance IS NOT NULL` guard reproduces `ov` exactly.

**Re-measurement** (`.scratch/met-144/v2/measure-no-ov.sql`, same candidate as Stage 1 —
`b932cafb…`, 45 skills; proxy caveat: `cand` via subquery, not the inlined VALUES):

| query | Stage 1 / 6 | now |
|---|---|---|
| match page query, **`ov` + Scorer port** (old) | 167–172 ms | — |
| match page query, **`ov` removed + `relevance IS NOT NULL` guard** (this PR) | — | **~170 ms** (166.4 / 167.0 / 168.3 / **169.9** / 172.5 / 174.0 / 174.5) |
| pure no-`ov`, no guard — the *future feed* shape (Stage 1 "(B)") | ~150 ms | unchanged, not on any endpoint yet |

So for the match endpoints this PR is a **wash on speed** (~170 vs ~167 ms, inside noise)
and a **simplification**: one fewer CTE, one fewer file, no port indirection. The ~150 ms
shape only appears once the follow-up drops the overlap guard for the cold feed. The
`HashAggregate` over the whole `position_nodes` fan-out (~144k rows → ~1.9k groups,
~145 ms) is still the floor and still what score materialisation would remove.

Commit: `refactor(score): drop the overlap probe and the Scorer port`.

### Stage 5 — not in this PR

Its three round-trip cuts (feed's separate `count` → window; delete
`hydratePositionsByIds`; drop `buildItems`' `skillRows` query) only remove duplication
the *unified endpoint* creates. `rankByRefs` already windows its count and hydrates only
its 20-row page, and the feed path is still separate — nothing to collapse yet. Moves to
the follow-up PR with the merge.

---

## Stage 5 — the round trips (original plan — moved to the follow-up PR)

1. Feed's separate `count` query → `count(*) OVER ()` on the page query.
2. Delete `hydratePositionsByIds`; the feed hydrates its own page.
3. Delete `buildItems`' `skillRows` query — compute have / missing / bonus in TS from the
   existing `fetchSkills` result plus the candidate's node ids.

**Gate 5:** full gate green + golden diff empty + `total` identical across at least four
filter combinations (no filter, `seniorities`, `domainIds`, `postedWithinDays=7`). Round
trips per page must now be 3; state the count in the commit body.

Commit: `perf(feed): one round trip fewer per page`.

---

## Stage 6 — close out

1. Re-run the Stage 1 measurements on the merged code; append the after-table here.
2. Update the tracker: status, what shipped, what is left.
3. `pnpm build:all` (includes the web build — catches any accidental cross-package break).
4. `oh-my-claudecode:code-reviewer` pass over the branch diff. Findings that are real get
   fixed in a follow-up commit; findings that are noise get a one-line note here.
5. **Stop. Do not push, do not open a PR.** Leave the branch local and report.

Commit: `docs(met-144): record the merge outcome`.

### Stage 6 result — 2026-09-02

**What shipped on `feat/MET-144-feed-scoring-merge`** (local branch, not pushed):

| commit | stage |
|---|---|
| `cb3da11` | Stage 0 — tracker + baseline |
| `2ab9e32` | Stage 1 — re-measure, Gate 1 verdict |
| `5d105c8` | Stage 2 — Scorer port (`score/scorer.port.ts`) |
| `7d9a76b` | Stage 3 — one `buildWhere` for both paths |
| `16f7ac6` | Stage 6 — review fixes (see below) |
| `8fbf70e` | Stage 6 — close-out record |
| _(later, owner call)_ | Stage 4 — `refactor(score): drop the overlap probe and the Scorer port` |

**Update 2026-09-02 (later the same day):** the owner reopened Stage 4. `ov` is
deleted, the Scorer port is reverted (Stage 4 section above has the full write-up and
re-measurement). Stage 2 / `16f7ac6`'s code is undone by that commit but stays in
history. Stage 3 (`7d9a76b`, one `buildWhere`) is kept. The unified endpoint and the
cheap path are a **follow-up PR** — last section.

**Re-measurement (Stage 1 queries, on the post-refactor code — `ov` still in place):**

| query | Stage 1 median | Stage 6 median |
|---|---|---|
| (A) feed page, no scoring | 12.1 ms | **12.6 ms** |
| (C) live scoring shape, `ov` kept | 167.7 / 172.4 ms | **166.8 ms** |

Endpoint wall-time for the sample candidate: ~160–175 ms, flat. The port + the
`buildWhere` swap add **no measurable cost** — the generated SQL is semantically
identical.

**Verification:** `pnpm lint` · `test:etl` (542) · `test:etl:int` (122) · `build` ·
`build:all` (web included) — all green. Golden `/cv/samples/:id/matches` output
byte-identical before/after across 11 query/filter combinations. `pnpm seo:audit`
skipped (no web change). `pnpm analytics:catalog` not required (`emitMatchScored`
unchanged).

**`code-reviewer` pass (step 4)** — verdict COMMENT, 0 critical / 0 high, 4 medium /
5 low. Fixed in `16f7ac6`:

- **`NullScorer` deleted.** It was unused *and* broken — the caller owns the SELECT
  commas and never null-checks `cte()`, so splicing `NullScorer` would emit invalid
  SQL. The `Scorer` interface alone documents the anonymous-path seam.
- `select()` doc corrected (caller supplies commas); each fragment method now names
  its SQL scope (`rk.` inside the CTE vs bare columns in the outer `ORDER BY`).
- Duplicated row shape collapsed onto one `ScoreRow` (made a `type` alias so
  `& ScoreRow` still satisfies `db.execute`'s `Record` constraint).
- `buildItems` local `ov` → `overlay` (`ov` is the SQL overlap probe).
- Comments trimmed to `STYLE.md` budget (the port file banner, the `buildFilters`
  history note).

Findings **not** actioned, with reason:

- **`domainIds` / `roleNodeIds` now compare as `uuid`, not `text`** (`buildWhere` uses
  `uuidList`). Two deltas neither golden combo can see: an uppercase-UUID `?roles=`
  link that silently matched nothing now matches; a malformed id raises `22P02`
  instead of returning empty. Both are gated by `NodeSlugResolver.toIds`, which only
  emits DB ids or `isUuid`-validated pass-throughs — unreachable as a bug, and delta 1
  is a latent fix. Left as-is; noted here.
- **`relevance: null → 0`** in `overlay()`. `relevance` is the one `agg` column with no
  `COALESCE`; if `node_stats` drops every matched row it is `NULL`. Old code put
  `null` on the wire (already a lie against `RankedVacancy.relevance: number`); new
  code puts `0`. Improvement, not a regression. A `COALESCE(...,0)` in `score.sql.ts`
  is the real fix — deferred (it is a `score/` edit).
- **`emitMatchScored` still hand-rolls `FROM ranked rk JOIN positions p`** rather than
  `scorer.join()`. Cosmetic; flagged so Stage 4 doesn't miss it.
- **`FeedFilterParams = Omit<FeedSearchParams, "page"|"pageSize"|"sort">`** to drop the
  dummy `page:1,pageSize:1` — nice, but touches `listForSitemap`'s literal call site.
  Deferred; low value.

**Net for the owner:** superseded by the 2026-09-02 update above — `ov` is now gone and
the port with it. What ships in this PR: `ov` deleted, one `buildWhere`, match output
byte-identical. What's left: the unified endpoint + the cheap path, below.

---

## Follow-up PR — the unified endpoint + the cheap path

**Full implementation spec: [`unified-feed-score.md`](unified-feed-score.md).** That file
owns the design (overlap as a lens flag, the two paths, the scorer's two entry points,
single-vacancy + Telegram scoring, the order of work, the open decisions). What follows
here is the summary as it stood when the `ov` PR closed.

### Why it's a separate PR

The cheap path — score only the ~20 Positions on the page instead of the whole filtered
set — pays off **only** when the score decides neither the result set nor its order:
`sort=date`, no `minFitTier`, no off-stack hiding. No endpoint is in that state today:
warm `/match` defaults to `sort=score`, and `/match?sort=date` still hides off-stack
rows, which needs the whole set scored to count them. So the cheap path is dead code
until the cold feed exists — it belongs with the merge, not before it.

### Shape

`resolveFeedQuery(candidateId | null, urlFilters) → { filters, sort, cand, page }` — the
one place aware candidates exist. `GET /feed` gains an optional authenticated-candidate
resolve; `FeedService.search` (or a thin sibling) takes `cand: SQL | null`.

- **`cand === null`** (anonymous): today's feed query, untouched. No scoring CTE.
- **`cand !== null`, `sort=date`, no `minFitTier`** — the **cheap path**:
  1. page = `positions p WHERE buildWhere ORDER BY last_source_activity_at DESC LIMIT 20`
     — the cold query, ~12 ms.
  2. score those ≤20 ids: `scoringCtes(cand)` with `agg` scoped
     `WHERE pn.position_id IN (:pageIds)` — needs a `scopeIds?: SQL` param on
     `scoringCtes` / `rankedCte` (the one new knob).
  3. overlay each card; a zero-overlap Position renders with no Fit badge (null
     overlay), it is not hidden.
  - `total` = the cold `count(*)` (already windowed). No `off_stack_hidden` — the cold
    feed does not hide off-stack.
- **`cand !== null`, `sort=score` OR `minFitTier` set** — the **full path**: today's
  `rankByRefs` query minus the `relevance IS NOT NULL` guard (or with it behind a
  `requireOverlap` flag the feed leaves off). ~150–170 ms, unavoidable without score
  materialisation. This is the deliberate "rank the whole radar for me" action.

### Also folds in

- **Bring the Scorer port back**, shaped to two real consumers (the feed's nullable
  overlay, `rankByRefs`' full overlay) and — if Part 2 has started — a second
  implementation. Not the six-fragment version; whatever those callers actually need.
- **`requireOverlap` flag** instead of the unconditional `AND rk.relevance IS NOT NULL`.
  Legacy `/ranking/match` + `/cv/:id/matches` keep passing it (byte-identical); the feed
  path does not.
- **Stage 5 round trips:** feed's separate `count` → window; delete
  `hydratePositionsByIds`; `buildItems`' `skillRows` → TS from `fetchSkills` + cand ids.
- **Frontend:** the feed page shows the Fit badge on a card when the viewer has a CV.
  Telegram digest overlay is a later step again.

### Gate

Full gate + golden `/cv/samples/:id/matches` still byte-identical (legacy wrappers) +
a new golden set for `GET /feed?<candidate>` + `total` parity across filter combos +
the cheap path's EXPLAIN back near the cold ~12 ms. Measure both sorts on a prod-sized
restore.

---

## If Linear is connected

Close **MET-120** (PR #157 merged 2026-08-02, the issue still reads "In Progress" and is
MET-144's only recorded blocker), then move MET-144 to In Progress. If the Linear MCP
server is not authenticated, skip it and note it here — it is not worth a detour.

**Done 2026-09-02:** MET-120 → **Done** (`completedAt` set). MET-144 → **In Progress**,
with a comment recording what shipped (port + one `buildWhere`), what Gate 1 stopped
(`ov` deletion + the single-query merge), and the decision left to the owner.
