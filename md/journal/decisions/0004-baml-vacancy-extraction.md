# ADR-0004 — BAML as the single source of truth for vacancy extraction

**Status:** accepted
**Date:** 2026-05-01
**Context (in time):** Stage 04 → leading into Stage 06 (extraction quality)

## Context

T7 introduced an extractor abstraction (`VacancyExtractor` interface + `OpenAiVacancyExtractor` impl + `PlaceholderVacancyExtractor`). The OpenAI implementation hand-wrote three things in lockstep — the OpenAI Chat Completions request, a hand-rolled JSON Schema (`EXTRACT_VACANCY_JSON_SCHEMA`), and a Zod schema (`ExtractedVacancy`) — and the prompt was a plain string with no per-field guidance. Any change to the extracted shape required editing all three plus the prompt; the prompt and JSON Schema drifted silently while only Zod was checked at runtime.

We also planned to **enrich the extraction shape significantly** (split must-have vs. nice-to-have skills, normalized `{city, country}` locations, structured salary, `engagementType`, `hasReservation`, etc.) so we can later match against canonical DB tables (skills/aliases, locations, companies). With three places to keep in sync, the cost of every iteration on the prompt grew nonlinearly.

BAML (`@boundaryml/baml`) lets us declare `class ExtractedVacancy` once with `@description("…")` on every field; that file generates a typed TS client and feeds the same descriptions into the LLM via `{{ ctx.output_format }}`. Schema-Aligned Parsing (SAP) returns a structurally-validated TS value. One file, one source of truth.

## Options

### Option A — Add BAML as a peer extractor selectable by env, keep OpenAI legacy
- ✅ A/B-able rollback during initial validation
- ❌ two LLM clients, two schemas (Zod vs BAML class), prompt rules duplicated
- ❌ OpenAI extractor would also need to learn the new richer shape, doubling work

### Option B — BAML replaces OpenAiVacancyExtractor outright; Zod schema deleted
- ✅ single source of truth (the `.baml` file): schema, prompt, per-field rules
- ✅ generated TS type (`baml_client/types.ts`) is the canonical `ExtractedVacancy`
- ✅ no parallel Zod re-validation step — BAML's SAP guarantees shape
- ❌ no rollback to a non-BAML LLM path; if BAML output regresses we fix the `.baml` file
- ❌ `rss_records.extracted_data` rows written by the old extractor have a different (snake_case) shape — they sit as stale jsonb until a future re-extract pass

## Decision

We pick **Option B**. `OpenAiVacancyExtractor` and `apps/etl/src/extraction/extracted-vacancy.ts` (Zod) are deleted. BAML is the only LLM path; `EXTRACTOR_PROVIDER ∈ {baml, placeholder}` (placeholder is the default for tests / no-key environments).

`apps/etl/baml_src/extract-vacancy.baml` declares:
- six enums (`Seniority`, `WorkFormat`, `EmploymentType`, `EnglishLevel`, `Currency`, `EngagementType`) with UPPERCASE values that map 1:1 to TS enum members,
- three nested classes (`ExtractedLocation { city, country }`, `Skills { required[], optional[] }`, `Salary { min?, max?, currency? }`),
- the top-level `ExtractedVacancy` (14 fields: `role`, `seniority`, `skills`, `experienceYears`, `salary`, `englishLevel`, `employmentType`, `workFormat`, `locations[]`, `domain`, `engagementType`, `companyName`, `hasTestAssignment`, `hasReservation`),
- `function ExtractVacancy(text: string) -> ExtractedVacancy` with the prompt block and a baseline `test` block.

Every field carries `@description("…")` with extraction rules (e.g. *"yearly salary → DIVIDE by 12"*, *"Architect → PRINCIPAL"*, *"Hard skills only; exclude Scrum/Agile"*). These descriptions are rendered into the prompt via `{{ ctx.output_format }}`, so the LLM sees per-field guidance with the type contract.

`BamlVacancyExtractor.extract(text)` is one line — `return b.ExtractVacancy(text)` — and the activity-side type is imported directly from `baml_client`. The Zod re-validation step that existed in the first version of the BAML extractor is removed: BAML SAP already returns a structurally-typed value, and we trust it as the boundary.

The Zod re-validation gave us "loud failure on schema drift" only against a Zod schema that, by construction, mirrored the BAML class. Removing it costs nothing in safety (the BAML class is the contract) and removes a duplicated shape definition.

## Consequences

- **One file to edit when iterating on extraction:** `baml_src/extract-vacancy.baml`. After editing, `pnpm --filter @metahunt/etl baml:generate` regenerates the typed client; `pnpm --filter @metahunt/etl baml:check` validates the DSL.
- **`apps/etl/src/baml_client/` is committed** (14 files). Dockerfile and CI need no codegen step. Re-generation is a manual code-review-gated action.
- **No rollback to a hand-rolled OpenAI client.** If we hit a hard issue with BAML's SAP, the rollback is a `git revert` of this work, not an env-var flip.
- **`rss_records.extracted_data` jsonb has two historical shapes.** Old rows (snake_case, flat: `salary_min`, `work_format`, …) and new rows (camelCase, nested: `salary.{min,max,currency}`, `skills.{required,optional}`, …). The activity only writes; nothing in the code reads the old jsonb yet, so this is dormant tech debt. Stage 06 will introduce a normalizer + re-extract job which will read both shapes (or wipe and re-fetch).
- **`OPENAI_API_KEY` is still required** when `EXTRACTOR_PROVIDER=baml` because the `OpenAIClient` defined in `clients.baml` reads it. Switching providers means editing `clients.baml` (e.g. to `anthropic` with `ANTHROPIC_API_KEY`), not adding TS code.
- **`LLM_EXTRACTION_ENABLED` is gone.** Boolean gating was redundant once `EXTRACTOR_PROVIDER` exists.
- **New runtime dep:** `@boundaryml/baml`. CLI (`baml-cli`) ships in the same package.
- **Removed deps:** `openai` (no longer used after the OpenAI extractor was deleted).
