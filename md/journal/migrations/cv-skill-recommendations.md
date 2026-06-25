# cv-skill-recommendations — "what to learn next" widget on reverse-ATS

**Status:** ✅ implemented — etl + web build green, band/derive unit tests pass.
Pending: manual SQL spot-check on prod DB + smoke, then merge.
**Branch:** `feat/cv-skill-recommendations`
**Sits atop:** ADR-0009, reverse-ats (ADR-0006), ranking (ADR-0006)
**Date:** 2026-06-23

## Goal

On `/reverse-ats`, beside the matched CV, show a ranked list of skills to learn next, each as a marginal counterfactual: "learn X → +N vacancies become a real match". Honest (single-skill greedy), computed from the existing IDF + required-coverage signal, cheap enough to run inline. See **ADR-0009** for metric + guardrails.

## Design

- **Cohort:** vacancies WHERE `role_node_id` = candidate's role node AND (`seniority` in band ±1 OR NULL). Band over `seniority.enumValues` (INTERN…C_LEVEL).
- **Unlock test:** missing required skill `S` unlocks near-miss `v` iff `(matched_required_w + idf(S)) / required_total_w ≥ FIT_GOOD_MIN`.
- **Output:** top-`REC_TOP_N` skills by `unlocks`, each with `toStrong`, `idf`, `leverage`; plus `coveragePct`, `cohortSize`, `redundant[]`.
- **Guardrails:** VERIFIED nodes only · cohort df-floor `REC_DF_FLOOR=5` · generic df-share ceiling `REC_GENERIC_DF_SHARE=0.6`.
- **Reality corrections vs the plan:** candidates store `role` as a string → add a role-string→ROLE-node resolver. `recommend()` takes resolved refs+role+seniority (controller resolves) → no `CvModule→RankingModule` cycle. `buildFilters` extraction skipped (YAGNI — cohort is role+seniority only).

## Decisions (interview)

- Widget layout: **horizontal bars** (bar scaled to +N, leverage ⚡, coverage gauge header, redundant footnote).
- v1 scope: **lean** — ranked list + gauge + leverage + redundant. «майже там» real vacancy cards (`FeedService.hydrateByIds`) are a fast-follow, not v1.

## Plan (by commit)

1. ✅ `docs` — ADR-0009, this tracker, STYLE no-Cyrillic rule.
2. ✅ `feat(ranking)` — `recommendation.service.ts` (cohort + counterfactual CTE + add-ons), `seniority-band.ts` + `recommendation.derive.ts` helpers, `RankingService.resolveRole`, contract DTOs/constants, `GET /cv/:id/recommendations`, `weightedMatchedNodes` reuse in the loader, unit tests for the band + derive helpers.
3. ✅ `feat(web)` — `cvApi.recommendations` + `ranking.ts` types, `SkillRecommendations` widget (horizontal bars), wired into `ReverseAtsClient` (CV source only), reduced state via `reducedState`.

## Outcome

Marginal-counterfactual recommendations ship as a CV-rail widget. The cohort
is role+seniority (no `buildFilters` reuse — YAGNI). `recommend()` takes resolved
refs+role+seniority so `CvModule → RankingModule` stays one-way. Deep SQL math is
covered by manual spot-check (verification step 3), not a unit test — the unit
tests cover the pure band/derive logic, mirroring `ranking.contract.spec.ts`.

## Out of scope (fast-follow / future)

- **Sample-path recommendations** — v1 is CV-only (samples have no stored candidate / candidateId). Needs a recommend-by-skills variant.
- «майже там» expandable real vacancy cards (`FeedService.hydrateByIds`).
- A DB-backed integration test asserting hand-computed unlocks/toStrong.
- Skill combos (greedy-2), target-role mode, effort-adjusted ranking, demand trend.

## Acceptance criteria

See plan `.omc/plans/cv-skill-recommendations.md`. Key: every recommended node is VERIFIED, `unlocks ≥ 1`, sorted desc; no skill above the generic ceiling or below the df-floor; `coveragePct = count(cov≥0.5)/cohortSize`; a Backend candidate never gets a Frontend-only skill; fixture unit test matches hand-computed unlocks/toStrong.
