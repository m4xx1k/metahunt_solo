# Unified feed ⊕ score — implementation

**Status:** design, decisions locked 2026-09-02 (§8). Follows PR #205 (MET-144 Part 1: `ov` deleted, one
`buildWhere`). **Tickets:** MET-144 (the merge) · MET-104 (Part 2, the ranker model).
**Date:** 2026-09-02

The one idea, in one sentence:

> **A Fit score is optional data attached to a vacancy card, not a different endpoint.**

Everything below follows from that. `VacancyDto` gains `match: MatchOverlay | null`.
Anonymous visitor → every card `null`. Visitor with a CV → every card carries a Fit badge.
Nothing else about the feed changes shape.

---

## 1. Do we actually need the overlap gate?

Today `rankByRefs` carries `AND rk.relevance IS NOT NULL` — the old `ov` probe, kept so
PR #205 stayed byte-identical. The question for the merge is whether the unified endpoint
keeps it.

**Answer: yes, but as a property of the lens, not of the query.**

| lens | overlap gate | why |
|---|---|---|
| **warm** — "vacancies for me", `sort=score` | **on** | a vacancy sharing zero skills with the CV is not a match. Without the gate `total` claims ~14 000 matches when ~2 000 are real — the number lies. |
| **cold** — "everything fresh", `sort=date` | **off** | this is the feed. Hiding a fresh vacancy because it does not match your CV is wrong; the score is a hint on the card, not a filter. |

So it becomes a parameter — `requireOverlap: boolean` — defaulting to the lens, not a
constant in the SQL. Legacy `/ranking/match` and `/cv/:id/matches` pass `true` and stay
byte-identical.

**Known weakness, not fixed here.** `relevance IS NOT NULL` means "shares ≥ 1 skill",
including one trivial optional skill (a vacancy asking Java + Spring that also lists Git
passes for a Python candidate, at 0 % coverage). It is a weak gate. The right gate is a
coverage floor, which is a **Part 2 / MET-104 model question** — `minFitTier` already
exists as the user-facing lever. Do not tighten it in this PR.

---

## 2. Two paths

The score is expensive only when it **decides** something. When it merely decorates, it
is nearly free. That is the whole optimisation.

```
                    does the score decide the result set or its order?
                                   /                    \
                                 no                      yes
                          CHEAP PATH (~15 ms)      FULL PATH (~150-170 ms)
```

**Cheap path fires when all of:** `sort=date` · no `minFitTier` · `requireOverlap=false`
· no off-stack hiding. In practice: the cold feed, with or without a CV — and per §8.1
that is the **default page load** for everyone, so this is the common case, not the
exception.

**Full path fires otherwise:** `sort=score`, or any score-derived filter. In practice:
the warm "rank the radar for me" toggle, and the legacy match endpoints until they go.

### 2.1 Cheap path — two small queries

```sql
-- 1. the page: today's cold feed query, untouched.        ~12 ms
SELECT p.position_id, count(*) OVER () AS total
FROM positions p
WHERE <buildWhere(filters)>
ORDER BY p.last_source_activity_at DESC, p.position_id DESC
LIMIT 20 OFFSET :n;

-- 2. score exactly those 20 ids.                          ~2 ms
WITH <scoringCtes(cand, scopeIds := :pageIds)>
SELECT id, relevance, coverage, tier_bucket, on_stack FROM ranked;
```

Query 2 is skipped entirely when there is no CV. The overlay is joined in TypeScript:
`Map<positionId, MatchOverlay>`; a page row with no entry renders `match: null`.

**The one new SQL knob:** `scoringCtes(cand, scopeIds?)` adds
`WHERE pn.position_id IN (:scopeIds)` to `agg`. That turns the ~144 000-row
`position_nodes` fan-out into ~200 rows. This single parameter is what makes the cheap
path, the single-vacancy page and Telegram all possible.

### 2.2 Full path — today's query, minus the hardcoded gate

Structurally what `rankByRefs` already runs: score everything, join, filter, window the
counts, order, limit. Two changes: `requireOverlap` becomes a flag instead of a constant,
and the feed calls it through the same composition root.

Cost stays ~150–170 ms and that is accepted — it is an explicit user action ("rank the
whole radar against my CV"), not a page load. The floor is the `HashAggregate` over the
full `position_nodes` fan-out; removing it needs score materialisation (MET-120 option C),
which sits behind the same scorer and is a separate decision.

---

## 3. The scorer — two entry points, four consumers

PR #205 reverted the six-fragment `Scorer` port because it had one implementation and one
caller. It comes back here because the merge creates real consumers, and the shape falls
out of §2: the full path needs **SQL fragments** (scoring lives inside the page query);
the cheap path needs a **function** (scoring happens after the page is chosen).

```ts
// Created from a candidate's resolved skill-node ids. `null` = no CV, no scoring.
interface CandidateScorer {
  // FULL PATH — splice scoring into a page query.
  fragments(opts: { minFitTier?: FitTier; requireOverlap?: boolean }): {
    cte: SQL; join: SQL; select: SQL; filter: SQL | null; order: SQL;
  };
  // CHEAP PATH — score a fixed, already-chosen set of positions.
  overlayFor(positionIds: string[]): Promise<Map<string, MatchOverlay>>;
}
```

`overlayFor` is the important one. It is not a feed helper — it is **the general
"score these vacancies" primitive**, and every non-ranked surface is one call to it:

| surface | call | cost |
|---|---|---|
| cold feed page | `overlayFor(20 ids)` | ~2 ms |
| single vacancy page | `overlayFor([id])` | ~1 ms |
| Telegram digest / channel card | `overlayFor(ids of the sent batch)` | ~1–2 ms |
| warm ranked page | `fragments()` — scoring is inside the query | ~150 ms |

One formula, one file, four surfaces. That is what the port buys this time, and why it
was not worth having before.

---

## 4. Scoring one vacancy, and Telegram

Both fall out of `overlayFor` with no new query shape.

- **`GET /feed/vacancy/:id`** — resolve the viewer's CV from the JWT; if present, one
  `overlayFor([positionId])` and attach `match`. The skill diff (✅ have / ❌ missing /
  ➕ bonus) is computed in TS from the skills the endpoint already fetches plus the
  candidate's node ids — no extra query.
- **Telegram personalised digest** — already picks its positions through the matcher, so
  it is already on the full path. What changes: the card renderer reads `match` off the
  DTO instead of a parallel structure.
- **Telegram public channel** — no viewer, no CV → `scorer = null` → `match: null`
  everywhere. The channel post never shows a Fit badge, which is correct: a broadcast has
  no "you".

---

## 5. Backend changes

```
apps/etl/src/03-discovery/
  score/scorer.port.ts        NEW (again)  CandidateScorer: fragments() + overlayFor()
  score/score.sql.ts          scoringCtes(cand, scopeIds?) — the one new param
  feed/feed.contract.ts       VacancyDto.match: MatchOverlay | null
  feed/feed.service.ts        search(params, scorer: CandidateScorer | null)
  feed/feed.controller.ts     resolve candidate from JWT; pass the scorer down
  feed/resolve-feed-query.ts  NEW  the only code that knows candidates exist
  ranking/ranking.service.ts  rankByRefs drives fragments(); requireOverlap: true
```

`resolveFeedQuery(candidateId | null, urlFilters) → { filters, sort, scorer, page }` is
the composition root. `FeedService` never takes a `candidateId` — it takes an already-built
scorer or `null`. Candidate identity comes from the authenticated user, **never** a query
param, so this adds no new public surface.

**Legacy endpoints are wrappers, then they go** (§8.3). `POST /ranking/match` and
`GET /cv/:id/matches` first become thin wrappers with `requireOverlap: true` — that is
what keeps the 50-capture golden diff meaningful while the unified path is built. Once
`apps/web` no longer calls them (§7 step 7) they are deleted along with
`MatchResponse`, `RankingController.match` and the `/cv/:id/matches` handler.
`/cv/samples/:id/matches` is replaced by `GET /feed?sample=<id>` — see §8.

**Stage 5 round trips**, folded in here because the merge is what creates them: feed's
separate `count` → `count(*) OVER ()`; delete `hydratePositionsByIds`; drop `buildItems`'
`skillRows` query (the diff comes from `fetchSkills` + candidate node ids).

---

## 6. Frontend changes

Small, because the contract change is additive.

- `VacancyDto.match?: MatchOverlay | null` in `apps/web/lib/api/vacancies.ts` (hand-mirrored
  per ADR-0005).
- The vacancy card renders the Fit badge when `match` is non-null, nothing when null. One
  component, one conditional — the same card already exists on the `/match` page.
- `/radar` (feed) gains a sort toggle: **freshest** (`sort=date`, cheap) ⇄ **best fit**
  (`sort=score`, full). **Freshest is the default** (§8.1), including for a signed-in CV
  user — so the default page load takes the cheap path.
- The vacancy detail page shows the badge + the skill-diff panel when `match` is present.
- **The warm lens folds into `/radar`.** `use-results.ts` already carries a
  `ColdOpts | WarmOpts` union over `ListVacanciesResponse | MatchResponse`; the migration
  collapses it to one branch and one type. `features/vacancy-filters/warm-query.ts`
  (`fetchMatch`), `lib/api/ranking.ts`'s `match()`, and `lib/api/cv.ts`'s `matches()` /
  `sampleMatches()` are deleted with it.
- `CandidateProfile.tsx` reads `matched` / `unmatched` from `GET /cv/:id`
  (`CandidateView`) instead of `MatchResponse.resolved` — the data is already there.
- The off-stack control (`defaultIncludeOffStack`) stays, but only on the best-fit lens;
  the freshest lens has no off-stack hiding at all (§8.2).

---

## 7. Order of work

Each step ships green and is independently revertible.

1. **`scopeIds` on `scoringCtes`** + `overlayFor`. No caller yet. Unit + int test that
   `overlayFor([id])` equals the full path's row for the same position. *This is the
   riskiest correctness claim in the whole plan — prove it first.*
2. **Single vacancy page** gets `match`. Smallest real consumer, exercises `overlayFor`
   end to end, no feed changes.
3. **`resolveFeedQuery` + cheap path** on `GET /feed`, incl. `?sample=<id>` (§8). Golden:
   a new capture set for `/feed` with and without a CV; `total` parity against today's
   feed across filter combos; `EXPLAIN ANALYZE` back near the cold ~12 ms.
4. **Full path through the same root**; `requireOverlap` becomes a flag; the legacy
   endpoints become wrappers passing `true`. Golden `/cv/samples/:id/matches` must stay
   byte-identical — same 50-capture harness as PR #205.
5. **Stage 5 round trips.** State the per-page count in the commit body.
6. **Frontend — the feed side**: `match` on cards, badge, sort toggle defaulting to
   freshest, vacancy-detail badge + diff panel.
7. **Frontend — retire the warm lens**: collapse `use-results.ts` onto one type, point
   `/match` at `/radar?sort=score`, move `CandidateProfile` onto `GET /cv/:id`, delete
   `warm-query.ts` / `ranking.ts:match()` / `cv.ts:matches(),sampleMatches()`.
   **Before deleting anything server-side, prove equivalence**: for each of the 50 golden
   captures, `/radar?sort=score&…` must return the same item ids in the same order as
   `/cv/samples/:id/matches` did. That check *replaces* the byte-diff harness, which
   retires with the endpoints.
8. **Backend — delete the legacy endpoints**: `RankingController.match`,
   `/cv/:id/matches`, `/cv/samples/:id/matches`, `MatchResponse`, and whatever in
   `RankingService` no longer has a caller.
9. **Telegram** card renderer reads `match` off the DTO.

**Gate, every step:** `pnpm lint · test:etl · test:etl:int · build · build:all` + the
golden diff / equivalence check named for that step. Steps 1–6 are additive and each is
independently revertible; **7 and 8 are the one-way door** — do not start 8 until 7 is
merged and the web has been exercised against it.

---

## 8. Decisions — locked 2026-09-02 (owner)

1. **Default lens for a logged-in CV user on `/radar` is `sort=date` — freshest.**
   So the cheap path is the *default* page load and the feed stays ~15 ms. "Best fit"
   (`sort=score`, full path, ~150 ms) is an explicit toggle the user opts into.
2. **The cold feed does not hide off-stack vacancies.** `on_stack` filtering and the
   `off_stack_hidden` count come off the cold path entirely — that is precisely what
   keeps it cheap (the hidden-count needs the whole set scored). Off-stack stays a
   **warm-lens** affordance, unchanged from today: hidden by default, count reported,
   `includeOffStack` unhides.
3. **`/ranking/match` and `/cv/:id/matches` get deleted**, not kept as wrappers. Order
   matters — see §7 steps 6–8: build the unified path, migrate `apps/web` onto it,
   *then* delete. Nothing is lost: `MatchResponse.resolved` is already duplicated on
   `GET /cv/:id` (`CandidateView.matched` / `.unmatched`), and `use-results.ts` already
   carries a `ColdOpts | WarmOpts` union that collapses to one branch.

### The one wrinkle: public sample CVs

`GET /cv/samples/:id/matches` is `@Public()` and backs the sample-CV demo. The unified
feed resolves the candidate from the JWT and **never** from a query param — that rule
exists so nobody can rank someone else's CV by guessing an id.

Sample CVs are public fixtures, not user data, so the rule can bend for them and only
them: `GET /feed?sample=<sampleId>` resolves a scorer **only** if the id is in the
sample-candidate allowlist, and 404s otherwise. That keeps one endpoint instead of two
and leaks nothing. Do not generalise it to real candidate ids.

---

## Progress (branch `feat/met-144-unified-feed-score`, off `main` after PR #205)

**Step 1 — done, `9c27c76`.** `scopeIds?: SQL` on `scoringCtes` / `rankedCte`
(`score/score.sql.ts`): narrows `agg`'s FROM to an id list before the GROUP BY.
`overlayFor(db, candidateNodeIds, positionIds)` (new `score/scorer.port.ts`) is the
CHEAP PATH primitive from §3 — no caller yet. **Proven** against the full path: a new
`test/int/score.int.spec.ts` scores the same candidate + position through both
`overlayFor` (scoped) and `rankByRefs` (unscoped) and asserts relevance, coverage,
tier and on_stack match exactly, plus a scoping check (a second, out-of-scope id gets
no row) and an off-stack case. Unit suite (`scorer.port.spec.ts`) covers the pure
row→`MatchOverlay` projection and the empty-input short-circuits. Gate: lint ·
test:etl · test:etl:int · build · build:all — all green.

One decision made filling a spec gap in step 1: `MatchOverlay` (§3's return type)
lived in `scorer.port.ts`, not `score.contract.ts`, to dodge a circular import with
`ranking.contract.ts` (which already imports `ScoreBreakdown` the other way).
**Superseded in step 2** — see below.

**Step 2 — done, `0bdc6fa`.** `GET /feed/vacancy/:id` resolves the viewer from a new
`OptionalAuthGuard` (missing/invalid/stale token → anonymous, not a 401; a real
`AuthService` failure still propagates) and, when signed in, attaches `match` via one
`overlayForUser(db, userId, [positionId])` — `scorer.port.ts`'s new viewer-facing
wrapper around `overlayFor`, resolving the user's active `user_cvs` row (MVP: one per
user) to node ids. `VacancyDto.match: MatchOverlay | null` landed on `feed.contract.ts`;
`toDto` defaults it `null`, the controller overlays it after `getById`.

Revised the step-1 gap: `FitTier` (+ `FIT_TIER_VALUES`, `TIER_BUCKET`/`TIER_BY_BUCKET`)
moved from `ranking.contract.ts` into `score.contract.ts` (framework-free, zero
internal deps), which is where `MatchOverlay` now lives too — `ranking.contract.ts`
re-exports both so no existing importer changed. `ranking.service.ts` shares the tier
tables with `scorer.port.ts` instead of keeping its own copy.

Also fixed a real pre-existing int-test harness gap found while proving step 2: `test/
int/db.ts`'s `truncateAll()` never cleared `unique_vacancies` (the referenced side of
`vacancies.unique_vacancy_id`), so `dedup.int.spec.ts`'s unscoped `SELECT count(*) FROM
unique_vacancies` could inflate from rows other suites' fixtures left behind — bisected
with stash/re-run before landing the fix; full `test:etl:int` green 3/3 after.

Gate: lint · test:etl · test:etl:int · build · build:all — all green, both steps.

**Step 3 — done, `c640037`.** `GET /feed` scores its page against the viewer's active
CV (JWT via `OptionalAuthGuard`, same as `vacancy/:id`) or an allowlisted
`?sample=<id>` (§8's wrinkle — `?sample=` wins over auth if both are present; anything
whose `candidates.type ≠ 'sample'` 404s rather than silently falling back to
anonymous). CHEAP PATH only, as the step demands: the page query, its `ORDER BY` and
`total` are byte-identical to before this step — `resolveFeedQuery` (new
`feed/resolve-feed-query.ts`, the composition root) only turns a candidateId into a
`CandidateScorer`, and `FeedService.search(params, scorer?)` runs one
`scorer.overlayFor(pageIds)` alongside the existing row/skills fetch (`Promise.all`,
no added round trip). `CandidateScorer` (§3) is currently just the bound `overlayFor`
— `fragments()` (the FULL PATH half) waits for step 4, its first real consumer.

**Verified without a live server:** `total`/result-set parity between a scored and
unscored call with identical filters (structurally guaranteed too — the total/page
queries never see the scorer) + `createCandidateScorer`'s overlay matching `overlayFor`
called directly + `resolveSampleCandidateId`'s type boundary, all against a real DB
(`test/int/feed.int.spec.ts`, `test/int/score.int.spec.ts`). Timing: `EXPLAIN ANALYZE`
against the local dev DB (14547 real positions) — page query (untouched) ~15.5 ms, the
new scoped overlay ~6.5 ms, nowhere near the ~150–170 ms full path. (A native
`nest --watch` instance was already running on :3333 from an earlier/other session and
turned out stale — rather than touch a process this session didn't start, verification
went through psql + the int-test harness instead.)

Gate: lint · test:etl · test:etl:int · build · build:all — all green.

**Step 4 — done, `5566200`.** `CandidateScorer.fragments()` — the FULL PATH half of §3
— lands and gets two consumers: `RankingService.rankByRefs` (the legacy endpoints,
`requireOverlap: true` unconditionally) and a new `FeedService.searchScored` branch on
`GET /feed` (`sort=score`, or `minFitTier` forcing it even with `sort=date`).

**The byte-identical proof for rankByRefs, and why it isn't the .scratch/v2 captures.**
Those are ~2h old and the corpus drifts under hourly RSS ingest, so a diff against them
can't tell a real regression from ordinary data drift. Instead: `git stash` the step-4
diff, capture `rankByRefs` output for all 5 sample candidates × 10 filter combos on the
step-3 tip (50 files), `git stash pop`, capture again on step-4 (50 files), `diff -r` —
clean, 50/50 identical. This is provable by construction too: `fragments()` returns the
exact same `cte`/`join`/`select`/`filter`/`order` sub-expressions `rankByRefs` used to
build inline, spliced back together the same way, so the emitted SQL text doesn't move.

**Scope decision, flagged rather than silently taken:** "full path through the same
root" is written as step 4's own heading, and step 6 (frontend sort toggle) has nothing
to toggle unless `GET /feed` already accepts `sort=score` — step 4 is the only backend
step in between. So this step also adds `FeedService.searchScored`: off-stack hidden by
default (`offStackHidden` — new on `FeedResponse`), `requireOverlap: true` (§1 — a
zero-overlap Position isn't a match), silently falls back to the cheap path with no
scorer. New int suite in `feed.int.spec.ts` covers order, `minFitTier`, off-stack,
no-scorer fallback — direct correctness tests, not golden diffs, since this behavior is
new rather than preserved.

Layering: `MatchSort` (+ `MATCH_SORT_VALUES`) moved from `ranking.contract.ts` into
`score.contract.ts` alongside `FitTier` — same circular-import reason as step 2's
`FitTier` move. `ranking.contract.ts` re-exports both.

Gate: lint · test:etl (559) · test:etl:int (138) · build · build:all — all green.

**Step 5 — done, `a47b2ce`.** Stage 5 round trips. `FeedService.searchCheap`'s total
now rides the page query's own `count(*) OVER ()` (unscored cheap-path load: 4 queries
→ 3). `hydratePositionsByIds` deleted (its only caller was `RankingService.buildItems`)
and `buildItems`' own `skillRows` query dropped — both replaced by one new
`FeedService.fetchSkillRows` (superset of `fetchSkills`: `status <> 'HIDDEN'`, node
status + IDF weight), run in parallel with `selectPositions`. The DTO's VERIFIED-only
`skills` list and the ✅/❌/➕ diff both derive from that one row set now, filtered by
status in TS instead of two separate SQL status gates (warm/match path: 4 queries → 3).
`fetchSkills` itself untouched — its `includeAllSkills` mode intentionally still
surfaces HIDDEN nodes for operator/debug use, which the new method must not, so it's a
deliberately separate query rather than a third mode of the old one.

Same byte-identical proof method as step 4 (fresh before/after captures on the live
corpus, this diff stashed in between) — 50/50 identical.

Gate: lint · test:etl · test:etl:int · build · build:all — all green.

Next: step 6 — Frontend, the feed side: `match` on cards, Fit badge, sort toggle
defaulting to freshest, vacancy-detail badge + diff panel.
