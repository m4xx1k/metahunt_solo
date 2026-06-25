# ADR-0010 — Recommendation skill-metadata stack gates

**Status:** accepted
**Date:** 2026-06-25
**Context (in time):** the ADR-0009 counterfactual recommender is live; this gates its output. Extends, does not replace.

## Context

ADR-0009 ranks "what to learn next" by *unlock count* — how many cohort near-miss vacancies a missing required skill would push into ≥GOOD coverage. In a stack-mixed role cohort (e.g. "Backend Developer" spans Go, Java, Node, Python) the top-unlock skills are the **other stacks' core languages**, because those are exactly the vacancies the candidate is a near-miss on. IDF only re-orders within a tier; it cannot tell "core to MY stack" from "core to a SIBLING stack". The result was three concrete failures (skill-weighting-research §2):

- **F1 already-known:** a node/TS candidate gets *JavaScript* recommended (a stack has one primary language; TS ⇒ JS).
- **F2 foreign-stack:** a Go backend gets *Python / Java / FastAPI* (sibling-stack core tech).
- **F3 redundant footer:** *React* / *Swift* flagged "redundant" because they saturate a single-stack cohort.

The missing signal is **stack membership**, which IDF/co-occurrence alone can't supply (research rejected approaches A and the tiered-weight E-extra as higher-risk, lower-value for v1).

## Options

### Option A — co-occurrence re-scoring only
- ✅ no LLM, derived from our corpus.
- ❌ can't exclude sibling-stack languages (Java≈MySQL by mean-npmi) nor know TS⇒JS. ~1/5 candidates pass the gates. A useful prior, not a fix.

### Option B — categorical metadata gates (chosen core)
- One batched LLM pass classifies each VERIFIED skill into `node_tech_meta {category, stack, is_core, generic}` (ADR-0010 data layer). The candidate's **stack-set** = stacks where they hold an `is_core` skill. Drop predicates subtract foreign / already-known skills. Passes all hard gates 5/5.

### Option C — replace IDF with a tiered importance weight
- ❌ changes *ranking*, not just recommendations, for marginal recommendation gain (only suppresses generic Git/Linux). Higher blast radius. Deferred (research §8).

## Decision

**Option B — additive metadata gates over the existing recommendation query; ranking untouched.** Three `AND NOT (…)` subtractions on the item query plus a co-occurrence substitute test, all over `node_tech_meta` / `node_skill_cooc`:

- **F2 foreign-stack:** drop a concrete-stack `LANGUAGE|FRAMEWORK|LIBRARY` whose `stack` is not in the candidate's stack-set.
- **F1 already-known language:** drop a core `LANGUAGE` in a stack the candidate already holds a core language for (TS ⇒ JS).
- **Substitute gate:** drop a same-stack core `FRAMEWORK` *unless* it co-occurs (`npmi ≥ SUBSTITUTE_NPMI_MIN = 0.30`) with a held same-stack core framework. Drops Angular/Vue for a React-only dev; keeps Appium for a Selenium QA, and keeps a competitor that genuinely complements a held one.
- **Redundant footer:** only `generic` held skills may be flagged redundant, so React/Swift/TypeScript are never shamed.

Constants live in `ranking.contract.ts`; the predicates are ported into `recommendation.service.ts` (`css`/`lang_stacks`/`fw_stacks` CTEs + item `WHERE`). The query stays single round-trip — the gates add CTEs and predicates, no N+1.

**Key property — metadata absent ⇒ safe no-op.** Every gate is a pure subtraction guarded on `node_tech_meta` columns. A skill with no row (LEFT JOIN → NULLs) passes every `NOT (…)`; a candidate whose held skills are all `stack=null` (embedded, hardware, data — stacks we deliberately did **not** add to the vocab for v1) yields empty stack-sets, so the cohort degrades to the pre-gate ADR-0009 behaviour — never worse, never empties a specialized-role list.

## Consequences

- **Fixes** F1/F2/F3 structurally. Validated on prod data (5 real candidates, Backend/Frontend/Full-Stack): GATED lists drop every foreign language and already-known skill; React/TypeScript leave the redundant footer; Docker/CI-CD/K8s still surface when genuinely missing.
- **Ranking is byte-identical** — `ranking.service.ts`, `node_stats`, and the IDF weight are untouched; the recommendation still sorts by `unlocks DESC, node_stats.weight DESC`.
- **Prices we pay:** classification quality depends on one LLM pass (rubric-controlled; conservative "unsure ⇒ null"); a NEW (unclassified) held skill doesn't contribute to the stack-set until verified+classified; taxonomy duplicates (e.g. REST Assured twins) can still leak a rare already-known until deduped (handled separately, not a blocker).
- **Deferred:** the tiered importance weight (suppress generic Git/Linux from "learn next", sharpen ranking) — a separate experiment with ranking blast radius. See skill-weighting-research §4/§8.
- **Rollback:** fully additive — drop the two objects and revert the service to the pre-gate query; nothing else moves.
