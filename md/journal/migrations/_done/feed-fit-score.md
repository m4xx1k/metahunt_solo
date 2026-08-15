# feed-fit-score — Fit % on every card, on a /feed lab route

**Status:** implemented, pending review. etl unit (447) + int (103) green, web
build + tests (166) green.
**Branch:** `feat/MET-120-feed-fit-score`
**Sits atop:** reverse-ats (ADR-0006), ADR-0010 (stack gates)
**Date:** 2026-08-01

## Goal

The match score already existed and was already computed — it was invisible.
`RankingService.rankByRefs` produced `coverage` per vacancy and dropped it one
CTE later; the UI showed only a STRONG/GOOD/STRETCH badge, and cold visitors
(most of the traffic) saw nothing. MET-120 puts the number on the card, adds a
date/score sort, and does it on a new noindexed `/feed` route so `/` is untouched.

## Design

Scoring moved out of `RankingService` into `apps/etl/src/03-discovery/score/`:

- `score.sql.ts` — `scoringCtes` (candidate → stack-set → overlap probe →
  weighted pass → `coverage`) and `rankedCte` (+ `tier_bucket`, `on_stack`).
  Still **live SQL**; the numbers below are what a "materialize the score" call
  should be made on.
- `score.contract.ts` — `ScoreBreakdown { total, signals[] }` with
  `ScoreSignal { kind, raw, weight, contribution }`. One signal today
  (`skill-overlap`, weight 1). Each future signal (skill coefficients, domain
  boost, seniority) is one array entry and zero UI changes — the card's tooltip
  renders `signals`.

`on_stack` left `ORDER BY` and became `includeOffStack` (default `false`), so
page order always matches the number printed on the card.

## Measurements (DoD #10)

Real local corpus (prod restore): 9,269 vacancies, 86,596 `vacancy_nodes`,
6,485 `node_stats` rows. Candidate: a 44-skill CV. Page 1, pageSize 20,
30-day freshness window, `EXPLAIN (ANALYZE, BUFFERS)`, 5 warm runs each.

| sort | execution (ms, 5 runs) | planning | rows scored | collapsed rows |
|---|---|---|---|---|
| `score` | 79.4 / 80.8 / 81.1 / 81.7 / 84.8 | ~3.1 ms | 5,839 | 1,399 |
| `date` | 79.2 / 79.7 / 83.0 / 83.0 / 89.0 | ~3.1 ms | 5,839 | 1,399 |

**Sorting is free; scoring is the whole cost.** The `agg` HashAggregate over
61,559 joined rows → 5,839 scored vacancies takes ~76–78 ms of the ~81 ms total;
the final top-N heapsort over 1,399 collapsed rows is ~0.2 ms. Date sort is NOT
cheaper — the score is on every card, so the CTE runs either way, exactly the
risk MET-120 called out.

So the lever, if this ever needs to be faster, is materializing/caching the
per-(candidate, vacancy) score — not avoiding the sort. At ~81 ms it does not
need to be faster yet.

Same run: 746 rows shown, **653 off-stack rows hidden** by the new default for
that candidate — the toggle is not a rare edge case for a broad CV.

## Follow-ups (out of scope)

- `node_tech_meta` admin UI — MET-121.
- v2 ranker weights — MET-104. Nothing here changes the model, only what is
  extracted and exposed.
