# Unified feed ⊕ score — implementation

**Status:** design, not started. Follows PR #205 (MET-144 Part 1: `ov` deleted, one
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
· no off-stack hiding. In practice: the cold feed, with or without a CV.

**Full path fires otherwise:** `sort=score`, or any score-derived filter. In practice:
the warm "rank the radar for me" action, and both legacy match endpoints.

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

**Legacy endpoints stay.** `POST /ranking/match` and `GET /cv/:id/matches` become thin
wrappers over the same path with `requireOverlap: true`. Deleting them is a later branch,
after the web app has moved.

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
  (`sort=score`, full). Default is a product call — see §8.
- The vacancy detail page shows the badge + the skill-diff panel when `match` is present.
- `/match` keeps working unchanged throughout; migrating it onto `/radar?sort=score` and
  deleting it is a follow-up.

---

## 7. Order of work

Each step ships green and is independently revertible.

1. **`scopeIds` on `scoringCtes`** + `overlayFor`. No caller yet. Unit + int test that
   `overlayFor([id])` equals the full path's row for the same position. *This is the
   riskiest correctness claim in the whole plan — prove it first.*
2. **Single vacancy page** gets `match`. Smallest real consumer, exercises `overlayFor`
   end to end, no feed changes.
3. **`resolveFeedQuery` + cheap path** on `GET /feed`. Golden: a new capture set for
   `/feed` with and without a CV; `total` parity against today's feed across filter combos.
4. **Full path through the same root**; `requireOverlap` becomes a flag; legacy wrappers
   pass `true`. Golden `/cv/samples/:id/matches` must stay byte-identical — same 50-capture
   harness as PR #205.
5. **Stage 5 round trips.** State the per-page count in the commit body.
6. **Frontend**: badge on feed cards + sort toggle.
7. **Telegram** card renderer reads `match`.

**Gate, every step:** `pnpm lint · test:etl · test:etl:int · build · build:all` +
the golden diffs named above + an `EXPLAIN ANALYZE` showing the cheap path back near the
cold ~12 ms.

---

## 8. Open decisions (owner)

1. **What does a logged-in user with a CV see by default on `/radar` — freshest or best
   fit?** This is the single biggest perf lever in the plan. `date` → the cheap path is
   the default and the feed stays ~15 ms. `score` → every feed load is ~150 ms and the
   cheap path only fires when a user opts into freshness.
2. **Does the cold feed hide off-stack vacancies?** Recommendation: no. Off-stack hiding
   forces the full path (the hidden-count needs the whole set scored), so keeping it on
   the cold feed would defeat the cheap path. Keep it as a warm-lens affordance only.
3. **Migrate and delete `/match`, or keep it forever as a wrapper?** Keeping it costs one
   thin adapter; deleting it touches `apps/web`.
