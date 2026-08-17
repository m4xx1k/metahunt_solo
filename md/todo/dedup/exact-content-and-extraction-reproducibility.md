# Exact-content dedup + reproducible vacancy extraction

**Status:** proposed  
**Trigger:** Djinni postings `843433` / `843434` had byte-identical title and
description but DeepSeek returned different role/seniority pairs. The hard
structural gates split them into two positions despite cosine similarity
`0.98890234`.

## Outcome

An exact repeated posting can never become two positions because of stochastic
LLM metadata. Every extraction is attributable to the exact prompt contract,
model, runtime taxonomy, and normalized input that produced it. Historical
exact-content splits are repaired without resetting the whole dedup corpus.

This tracker has two deliverables:

1. **P0 — exact-content dedup and extraction reproducibility.** Mechanical,
   safe to implement and deploy independently.
2. **P1 — role-contract and taxonomy cleanup.** A linked follow-up requiring
   product decisions and a labelled model-eval set before re-extraction.

## Production evidence (read-only, 2026-08-17)

- 15,944 postings / 13,419 position groups / 0 pending dedup.
- 268 exact-content duplicate clusters (683 postings).
- 92 clusters (268 postings, 189 groups) are incorrectly split; all are Djinni.
- 375 exact-content pairs span different groups; all are same-source.
- 344 / 375 pairs are inside the current 45-day window.
- 348 pairs are blocked by role and/or seniority; minimum pairwise cosine is
  0.94788494 and median is 0.99193568.
- The reported pair passes date, company, pairwise-similarity, and
  centroid-similarity checks; it fails only role and seniority checks.

## Root cause

1. `rss_records.hash` contains `publishedAt`, so two source observations with
   identical content and different publication times are intentionally retained.
2. Each record calls the LLM independently; no extraction cache or single-writer
   concurrency guard exists.
3. `PROMPT_VERSION = 3` is a manual integer. Version 3 spans both
   `gpt-5.4-mini` and `deepseek-v4-flash`, input-sanitization changes, and mutable
   production taxonomy lists.
4. Role, seniority, and skills are included in embedding text.
5. Role and seniority are hard prefilter gates, so contradictory LLM outputs
   discard an exact duplicate before semantic similarity can decide.

## P0 design

### 1. Exact-content fingerprint

Create one shared builder for the actual normalized content:

```text
normalized_input = "Title: " + trim(title) + "\n\n" + cleanDescription(description)
content_fingerprint = sha256(normalized_input)
```

Persist/index the fingerprint. Do not overload `rss_records.hash`: two external
IDs and apply URLs remain two source observations even when they belong to one
position.

### 2. Exact-match resolver branch

Before the ANN role/seniority gates:

- same content fingerprint within the current 45-day window is a deterministic
  match;
- exact content overrides role and seniority disagreement;
- if both companies are known and differ, quarantine/report the pair instead of
  silently merging it;
- keep the existing role/seniority/company/0.92 pairwise+centroid gates unchanged
  for non-exact semantic candidates;
- persist a distinct reason such as `method: "exact_content"` so the decision is
  auditable and does not pretend to be an ANN decision.

### 3. Extraction spec identity

Replace the manual integer as the authoritative identity. Keep a human release
label if useful for dashboards, but cache/audit by machine hashes:

```text
baml_source_hash = sha256(production BAML source + client configuration)
taxonomy_hash    = sha256(sorted VERIFIED role/domain/skill names)
spec_hash        = sha256(
  function name + baml_source_hash + BAML runtime version + provider + model + taxonomy_hash
)
input_hash       = sha256(the exact text passed to ExtractVacancy)
cache_key        = (spec_hash, input_hash)
```

Split BAML tests/fixtures out of the production definition before hashing, so a
test-only edit does not invalidate production cache entries. Generate the source
hash during build/codegen and make CI fail when the generated identity is stale.
Record the Railway/git revision as audit metadata, not as the cache key.

Persist at least `spec_hash`, `input_hash`, provider, model, BAML version,
taxonomy hash, cache-hit/source metadata, and per-attempt usage. Add the same
identity as BAML custom trace tags when tracing is enabled.

### 4. Concurrency-safe extraction cache

The two identical Djinni items can be extracted in the same parallel batch. A
plain `SELECT`-then-call cache still allows two model calls and two answers.
Implement a unique `(spec_hash, input_hash)` extraction artifact with a
single-writer claim/lease:

- one worker owns the API call;
- concurrent workers reuse the completed artifact or retry while it is pending;
- an expired lease is recoverable after worker failure;
- a cache hit records zero new provider cost and references the original artifact;
- raw `rss_records` remain separate.

### 5. Invariant / observability

Add a read-only health query and scheduled/logged metric:

```text
exact content fingerprints spanning >1 position group = 0
```

Known-company conflicts are reported separately. This is a smoke detector, not a
database UNIQUE constraint: it must explain the offending groups and source.

### 6. Targeted historical repair

After deployment, run a dry-run command that lists the affected fingerprints,
groups, companies, and chosen target group. Apply only deterministic,
non-conflicting exact-content merges and recompute both old and target rollups via
`repairUniqueVacancy`.

Do not use global `dedup:reset` for this repair. Verify posting conservation,
group counters, canonical membership, representative membership, pending queue,
and the exact-split invariant after apply.

### 7. Tests and model evals

Default PR tests must make **no real DeepSeek/OpenAI calls**:

- unit-test fingerprint and spec-hash determinism;
- integration-test cache miss/hit, concurrent callers, failed-owner lease expiry,
  and cost accounting with a fake `VacancyExtractor`;
- integration-test identical content + contradictory role/seniority merging;
- test non-exact candidates still use every existing structural gate;
- test known-company conflict quarantine;
- test targeted repair dry-run/apply and rollup conservation.

Live model evaluation is separate and opt-in/scheduled:

- BAML tests use `@@assert` / `@@check` against a labelled golden set;
- run the configured real model explicitly, never in the normal Jest/PR suite;
- repeat ambiguous cases at least 3 times and report field stability as well as
  accuracy;
- pin/record model and spec identity; enforce a declared cost ceiling;
- no production write is part of an eval.

## P0 acceptance criteria

- The reported pair resolves to one position even when its stored role and
  seniority disagree.
- Exact-content matching does not weaken any non-exact semantic gate.
- Concurrent identical extraction requests persist one canonical artifact and
  one output.
- A cache lookup is invalidated by a production BAML, model, BAML runtime, or
  VERIFIED-taxonomy change, but not by a test-only edit.
- Every new extracted record carries reproducible spec/input identities.
- Production repair has a dry-run, bounded apply scope, conservation checks, and
  returns the exact-split invariant to zero for eligible rows.
- Default tests pass without provider credentials or network access.

## P1 — role contract and taxonomy cleanup

This must be a linked task, not hidden inside P0. Current evidence:

- The production prompt receives 41 VERIFIED roles, but the active role-v2 policy
  says roles are disciplines and targets 28.
- `Software Engineer` is still a generic VERIFIED bucket. It accounts for 166
  exact-split pairs against `Backend Engineer` and 35 against `Full Stack Engineer`.
- `Team Lead`, `Tech Lead`, `QA Team Lead`, and CTO overlap the separate
  seniority axis (`LEAD` / `C_LEVEL`).
- Parent and child roles are simultaneously VERIFIED (`QA Engineer` with
  Manual/Automation QA; `Mobile Developer` with iOS/Android/Cross-platform).
- Static prompt examples are stale: they say Backend/Frontend/Full Stack
  **Developer**, `ML Engineer`, and `Mobile Developer (iOS)`, while production
  canonicals are Backend/Frontend/Full Stack **Engineer**,
  `Machine Learning Engineer`, and `iOS Engineer`.
- The seniority rules are internally ambiguous for titles containing both
  `Senior` and `Architect`; both `SENIOR` and `PRINCIPAL` satisfy different rules.
- Only two vacancy BAML tests exist, neither has an assertion, and the large DOU
  fixture contains raw HTML even though production sends cleaned plain text.
- The prompt now injects 1,213 VERIFIED skill names (~12.3k characters), despite
  the earlier design rejecting a much smaller full skill list as prompt bloat.

P1 must:

1. Define role as an axis orthogonal to seniority and decide explicit treatment
   for Architect, Lead, Manager, and CTO titles.
2. Finish/revise the role-v2 target taxonomy before evaluating the prompt.
3. Remove every stale hard-coded role example or generate examples from the same
   canonical source.
4. Evaluate a BAML dynamic enum (`TypeBuilder`) sourced from VERIFIED roles so the
   model cannot invent spelling variants; retain an explicit reviewed escape hatch
   only if novel roles are a product requirement.
5. Decide whether the 1,213-name skill injection is removed, capped to a curated
   vocabulary, or justified by measured eval improvement.
6. Build a production-derived, human-labelled golden set covering ambiguous role
   boundaries and exact duplicate pairs. Add real assertions and stability runs.
7. Define the re-extraction, embedding invalidation, dedup re-resolution, and
   rollback plan before applying taxonomy/prompt changes to production.

## Existing ecosystem to reuse

- BAML v0.222 repo-native functions/types and generated TS client.
- BAML tests with `@@assert` / `@@check`.
- BAML `Collector` and per-call custom tags.
- BAML `TypeBuilder` for runtime enums sourced from the database.
- BAML beta prompt optimizer only after the golden set exists; it is not a
  substitute for labels and makes real paid model calls.
- Optional Boundary Studio tracing via `BOUNDARY_API_KEY`; evaluate data/privacy
  implications before sending vacancy inputs to an external observability service.
- Existing Temporal retry/orchestration and Postgres as the source of truth.
- Existing `repairUniqueVacancy` rollup writer and schedule-pause runbook.

## Non-goals

- Removing raw Djinni observations or their distinct apply URLs.
- Globally lowering semantic thresholds or removing structural gates.
- Making normal CI depend on provider credentials.
- Migrating to BAML v1 as part of this fix.
- Full-corpus dedup reset as a shortcut for targeted repair.
