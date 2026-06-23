# cv-skill-recommendations — "what to learn next" widget on reverse-ATS

**Status:** 🚧 in progress — docs landed; backend + frontend pending.
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
2. ⬜ `feat(ranking)` — `recommendation.service.ts` (cohort + counterfactual CTE + add-ons), `seniority-band.ts` helper, role resolver, contract DTOs/constants, `GET /cv/:id/recommendations`, unit test.
3. ⬜ `feat(web)` — `cvApi.recommendations` + types, `SkillRecommendations` widget (horizontal bars), wired into `ReverseAtsClient` (sample + uploaded paths), reduced state when `cohortSize < 20`.

## Out of scope (fast-follow / future)

- «майже там» expandable real vacancy cards (hydration).
- Skill combos (greedy-2), target-role mode, effort-adjusted ranking, demand trend.

## Acceptance criteria

See plan `.omc/plans/cv-skill-recommendations.md`. Key: every recommended node is VERIFIED, `unlocks ≥ 1`, sorted desc; no skill above the generic ceiling or below the df-floor; `coveragePct = count(cov≥0.5)/cohortSize`; a Backend candidate never gets a Frontend-only skill; fixture unit test matches hand-computed unlocks/toStrong.
