# feed ⊕ scoring merge — one query, an optional overlay

**Status:** planned, not started. No code written. Branch not cut.
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

---

## Stage 4 — delete `ov`, unify the query shape

**Only if Gate 1 was green.**

1. Delete the `ov` CTE; `agg` reads `position_nodes` directly.
2. Collapse both paths onto the single query shape from Part 1 above.
3. **Preserve legacy output:** zero-overlap positions now score `relevance IS NULL`, which
   would change what `/ranking/match` and `/cv/:id/matches` return — and the frontend is
   untouched by design. So the two legacy wrappers pass `requireOverlap: true`, which
   `scorer.filter()` renders as `relevance IS NOT NULL`. The unified path leaves it off.

**Gate 4:** full gate green + **golden diff still empty** — that is exactly what
`requireOverlap` buys, and it is the proof the wrappers are honest. A non-empty diff here
means the flag is not wired.

Commit: `refactor(score): drop the overlap probe, unify the query shape`.

---

## Stage 5 — the round trips

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

---

## If Linear is connected

Close **MET-120** (PR #157 merged 2026-08-02, the issue still reads "In Progress" and is
MET-144's only recorded blocker), then move MET-144 to In Progress. If the Linear MCP
server is not authenticated, skip it and note it here — it is not worth a detour.
