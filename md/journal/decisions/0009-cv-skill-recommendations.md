# ADR-0009 — CV skill recommendations ("what to learn next")

**Status:** accepted
**Date:** 2026-06-23
**Context (in time):** reverse-ATS (ADR-0006) is live; this extends it.

## Context

The reverse-ATS page tells a candidate how well their CV matches vacancies. The natural next question is *"what do I learn to match more?"*. We need a metric that is honest (no vanity "+1000 jobs"), computed from the same ranking signal (skills + IDF), and cheap enough to run inline on page load. The corpus has 7100 vacancies, ~9.5 SKILL tags each, IDF weight `sqrt(ln(N/(df+5)))` per skill (`libs/database/src/schema/node-stats.ts`).

## Options

### Option A — Raw skill frequency ("X appears in N vacancies")
- ✅ Trivial query.
- ❌ Dishonest: counts vacancies the candidate already matches or could never reach; ignores what *changes* if they learn it.

### Option B — Marginal counterfactual ("learn X → +N vacancies cross into a real match")
- ✅ Honest, decision-useful: counts only vacancies that improve *because of* this one skill.
- ✅ Reuses the existing required-coverage / fit-tier math (`fitTierWeighted`, `FIT_GOOD_MIN=0.5`).
- ❌ Heavier query (per-vacancy coverage recompute); single-skill greedy hides multi-skill unlocks.

### Option C — ML / learned recommender
- ❌ No training signal, no labels, over-engineered for the corpus size. YAGNI.

## Decision

**Option B — marginal counterfactual, set-based SQL.** For the candidate's role cohort (same `role_node_id`, seniority band ±1 incl. NULL), a missing required skill `S` *unlocks* a near-miss vacancy `v` iff `(matched_required_w(v) + idf(S)) / required_total_w(v) ≥ FIT_GOOD_MIN`. We aggregate `GROUP BY S` → `unlocks` (crosses into ≥GOOD) and `toStrong` (≥0.8), order by `unlocks` desc, take top-`REC_TOP_N`.

Single-skill greedy is intentional: a vacancy that needs two new skills must not inflate any single skill's count — honesty over coverage. Skill combos are a future iteration.

Eligibility guardrails: `nodes.status='VERIFIED'` only (kills taxonomy noise + duplicate-alias nodes), cohort df-floor `REC_DF_FLOOR=5` (drop niche noise), generic df-share ceiling `REC_GENERIC_DF_SHARE=0.6` (drop "everyone has it" skills like SQL/Git/Linux). "Generic" is a **cohort df-share ceiling**, not `weight==0` — nothing in this corpus has literal IDF≈0.

## Consequences

- **Enables** a candidate-facing "what to learn next" block and the redundant-skills / coverage-gauge / leverage add-ons from the same pass.
- **Prices we pay:** the counterfactual CTE is heavier than a frequency count; single-skill greedy under-counts multi-skill unlocks; cohorts smaller than the small-cohort threshold (20) get a reduced state instead of numbers.
- **Architecture:** candidates store `role` as a string, so a role-string→ROLE-node resolver is required before the cohort can be built. `recommend()` takes resolved refs + role + seniority (controller resolves), keeping the `CvModule → RankingModule` dependency one-way.
- **Sets up** future iterations: skill combos (greedy-2), target-role mode, effort-adjusted ranking, demand trend (needs historical node_stats snapshots — none exist today).
