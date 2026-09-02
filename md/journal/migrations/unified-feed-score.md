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

**Step 6 — IN PROGRESS, interrupted mid-work. Read this whole section before touching
anything.** "Frontend — the feed side: `match` on cards, badge, sort toggle defaulting
to freshest, vacancy-detail badge + diff panel."

**Backend half — done, `6789814`, pushed.** §4 promised a skill diff on
`GET /feed/vacancy/:id` that step 2 never actually built (it only attached `match`).
The frontend detail-page panel needs it, so it landed here: `scorer.port.ts` gained
`resolveViewerSkills` (the viewer's active-CV skills as `NodeRef[]`, for the diff's
"➕ bonus" column); `feed.contract.ts` gained `VacancySkillDiff` (no weight — this
endpoint doesn't rank skills against each other) and `VacancyDetailDto extends
VacancyDto` with `diff`; `feed.controller.ts`'s `vacancy()` builds it from the
vacancy's own already-fetched `skills.required`/`.optional` — no extra query for the
vacancy side. Full gate green, pushed to origin.

**Frontend half — UNCOMMITTED, working tree is currently BROKEN. Do not run
`pnpm build:web` and be surprised.** `git status` on this branch right now shows:
```
M apps/web/app/(feed)/_components/FeedShell.tsx
M apps/web/app/feed/_components/FitBadge.tsx
M apps/web/app/feed/_components/LabColdCard.tsx
M apps/web/app/feed/_components/LabWarmCard.tsx
M apps/web/lib/api/vacancies.ts
M apps/web/lib/seo/job-posting.spec.ts
```
What each one is:
- `lib/api/vacancies.ts` — hand-mirrored (ADR-0005) `MatchOverlay`, `VacancySkillDiff`,
  `VacancyDetailDto`; `ListVacanciesQuery` gained `sort`/`minFitTier`/`includeOffStack`/
  `sample`; `ListVacanciesResponse` gained `offStackHidden`; `byId` now returns
  `VacancyDetailDto`. **Done, typechecks clean on its own.**
- `FeedShell.tsx`, `job-posting.spec.ts` — trivial fallout fixes for the new required
  fields (`offStackHidden`, `match: null`). **Done.**
- `FitBadge.tsx` — refactored from `{ item: RankedVacancy }` (warm-only shape) to a
  generic `{ tier, percent, detail?, tooltip }` API, since the new `MatchOverlay` has
  no per-skill breakdown to itemise. **Done**, and `LabWarmCard.tsx` updated to call it
  with the old rich tooltip (moved `SIGNAL_LABEL` in locally). **Done.**
- `LabColdCard.tsx` — rewritten to take a new required `hasViewer: boolean` prop:
  locked CTA when `!hasViewer` (unchanged behavior), the real `FitBadge` when
  `vacancy.match` is non-null, nothing when `hasViewer` but nothing scored (no tagged
  skills). **Done in isolation, but its only caller wasn't updated yet** — this is
  the actual break:
  ```
  app/feed/_components/FeedLabShell.tsx(144,20): error TS2741:
    Property 'hasViewer' is missing in type '{ key: string; vacancy: VacancyDto; }'
  ```

**What's NOT done, in order:**
1. **`app/feed/_components/lab-query.ts`** — `toLabColdQuery` needs `sort`,
   `minFitTier`, `includeOffStack` (straight off `FilterState`, which already carries
   all three — `LabControls.tsx`/`FiltersApi` already read/write them, they just never
   reached the cold query) and a new `sample?: string` param.
2. **`app/feed/_components/FeedLabShell.tsx`** — the actual wiring, and the one open
   design decision:
   - `?cv=<id>` on this route can be EITHER a seeded sample OR an arbitrary real
     candidate id (`CvSelect`/upload) — `isSample = samples.some(s =>
     s.candidateId === cv)` already computes which. **`GET /feed?sample=` only
     accepts allowlisted samples and 404s on anything else (§8's security boundary:
     "never a real candidate id, so nobody can rank someone else's CV by guessing
     one")** — so a real `cv` id CANNOT be passed as `?sample=`. Decision taken but
     not yet implemented: keep `lens = cv && !isSample ? "warm" : "cold"` — a real
     arbitrary candidateId stays on the untouched warm `/ranking/match` path (step 7's
     job to retire); only a *sample* `cv` moves onto the cold/unified path. Revisit
     this split only if it turns out wrong, don't just paper over the 404.
   - Pass `sample: isSample ? cv : undefined` into `toLabColdQuery`'s call.
   - Pass `hasViewer={cv != null}` to every `LabColdCard`.
   - Show `LabControls` (sort/off-stack toggle) in the cold lens too when a sample is
     selected, not just in "warm" — read `offStackHidden` off `cold.data` there.
3. Re-run `pnpm exec tsc --noEmit` in `apps/web` (must go clean), then `pnpm exec
   jest` there (180 tests before this work started — must still be 180+ green).
4. **Visual check before calling step 6 done** — this session never launched the app.
   Use the `run` skill (or `pnpm docker:up` + a browser) to actually look at `/feed`
   with a sample selected: does the real Fit badge render, does sort toggle between
   freshest/best-fit actually reorder cards, does off-stack unhide work. Nothing here
   has been visually verified, only typechecked.
5. **The vacancy detail page — NOT STARTED AT ALL.** `app/vacancy/[slug]/page.tsx` +
   `_components/` need the Fit badge + diff panel (have/missing/bonus) using the
   `VacancyDetailDto.match`/`.diff` the backend half already ships. No exploration of
   this page's current structure has happened yet.
6. **Production `(feed)` route group — deliberately not touched, undecided.** The
   home feed (`app/(feed)/[[...slug]]/page.tsx`, the real traffic) still uses the old
   split cold/warm split (`use-results.ts`'s `ColdOpts | WarmOpts`, `warm-query.ts`'s
   `fetchMatch`) untouched. This session chose to prototype step 6 on `/feed` (the
   existing noindex lab route — it already had the sort toggle, off-stack toggle and
   `useResults` hook built, seemingly anticipating exactly this migration) rather than
   the production route, to keep risk contained on a live, launched product. Whether
   step 6 needs to *also* reach the production route before step 7 collapses
   `use-results.ts` to one branch, or whether the lab is a sufficient step 6 and
   production migration happens as part of step 7, is **not decided — ask the owner**
   if it's not obvious once the lab route is finished and visually verified.

**Full gate has NOT been run since the frontend edits started** (`pnpm test:etl:int`,
`pnpm build`, `pnpm build:all` from `.scratch/met-144/run-gate.sh` — reuse it once web
typechecks clean again).

**Verification technique reminder for whatever's next (steps 7's item-id equivalence,
step 8's byte-identical proof isn't needed there but similar rigor might help):** the
`.scratch/met-144/v2/*.json` static captures are stale (corpus drifts under hourly RSS
ingest) — don't diff against them. Instead: write a throwaway `apps/etl/scratch-*.ts`
script (delete before committing), point `DATABASE_URL` at the local dev DB
(`postgresql://metahunt:metahunt123@localhost:54323/metahunt_railway`), `git stash`
the diff under test, capture, `git stash pop`, capture again, `diff -r` the two
directories. Steps 4 and 5 both used exactly this and got 50/50 identical. There's
also an unrelated, unowned `nest --watch` process that may or may not still be
sitting on :3333 from an earlier/other session — it was stale last time this was
checked; don't rely on it, don't kill it without checking whose it is first.

Next: finish step 6 per the checklist above, then step 7 — Frontend, retire the warm
lens: collapse `use-results.ts` to one branch/type, point `/match` at
`/radar?sort=score`, move `CandidateProfile` onto `GET /cv/:id`, delete
`warm-query.ts` / `ranking.ts:match()` / `cv.ts:matches(),sampleMatches()`. **Prove
item-id equivalence against the 50 golden captures before deleting anything
server-side** — for each of the 50, `/radar?sort=score&…` (or whatever the production
route ends up being) must return the same item ids in the same order as
`/cv/samples/:id/matches` did; that check replaces the byte-diff harness. Steps 7 and
8 are the one-way door — do not start 8 until 7 is merged.
