# taxonomy-curation — seed nodes, instrument coverage, moderate

**Branch:** `feat/loader-pipeline` (work landed here; never branched off `feat/taxonomy`)
**Status:** Phase 1 backend done; nodes.json on Tier 1 iteration · curation ongoing
**Started:** 2026-05-06

## Goal

Make the silver-layer `nodes` table a curated taxonomy that the loader resolves against, instead of the empty alias index it shipped as. Three layers:

1. **Seed** — bootstrap `nodes` / `node_aliases` from a hand-curated `libs/database/seeds/data/nodes.json` so most extracted `(type, name)` pairs match a `VERIFIED` node on first load.
2. **Instrument** — `fill-vacancies` reports per-axis coverage (verified / new / created) and a frequency-ranked gap list, so each iteration on `nodes.json` is data-driven rather than guessed.
3. **Moderate** — read-only HTTP endpoints under `/admin/taxonomy/*` so a future moderator UI (or curl / scripts) can triage `status='NEW'` nodes, see what they block, and look up trigram suggestions for merging.

## What shipped

### Schema fix — type-scoped aliases (commit `51223fc`)

`node_aliases` aliases used to be globally unique on `name` alone. Lookup was type-blind: `"smart contracts"` returned whichever node grabbed the alias first, regardless of whether the caller wanted `SKILL` or `DOMAIN`. Migration `0006`:

- Adds `node_aliases.type` (denormalised from `nodes.type`).
- Backfills, then locks `NOT NULL`.
- Swaps the PK to a surrogate UUID and replaces `unique(name)` with `unique(name, type)`.

`NodeResolverService` lookup now filters by both `name` and `type`; insert populates `type`. The `type` parameter — already accepted on the service surface — finally gets used at lookup time.

### Seed (commit `51223fc`)

`libs/database/seeds/data/nodes.json` populated with three sections (`SKILL` / `DOMAIN` / `ROLE`) — 216 + 21 + 80 canonicals, 776 aliases, all `status='VERIFIED'`. `libs/database/seeds/nodes.seed.ts` reads each section; no cross-section dedup.

After Tier 1 iteration (`eaf46ac`) the file is at 360 canonicals across the three types.

### Coverage instrumentation (commits `ca6908d` + `921b4e1`)

- `apps/etl/scripts/fill-vacancies.ts` — one-shot CLI, bypasses Nest/HTTP, walks `rss_records WHERE extracted_at IS NOT NULL AND no matching vacancies row` and runs `VacancyLoaderService` per id with streaming progress.
- After the seed work landed, the script was rewritten to probe `node_aliases` *before* the loader runs and classify every `(type, name)` mention BAML extracts:
  - **matched-VERIFIED** — alias hits a curated node (taxonomy win).
  - **matched-NEW** — alias hits a node a prior loader run auto-created (carry-over gap).
  - **created-NEW** — no alias; resolver mints a fresh `status='NEW'` node.
- Output ends with a top-N frequency-weighted gap list per type — direct input for the next pass on `nodes.json`.

`vacancy_nodes` PK bug fix landed in the same commit. Distinct alias spellings of the same skill (`"react"` / `"react.js"` / `"reactjs"`) now collapse to one node id via the seeded aliases. When two such spellings appear in the same vacancy (or one in `required` and one in `optional`), the loader emitted duplicate `(vacancy_id, node_id)` rows and tripped the PK — surfaced on the very first post-seed fill (14 / 86 records failed). Fix: dedup by node id before insert, prefer `required=true` when both flags are seen.

### Admin endpoints — Phase 1 (commit `b6e1052`)

New module `apps/etl/src/taxonomy/`. Read-only, no UI — JSON only, intended to drive a future `apps/web` admin route. Migration `0007` enables `pg_trgm` (was previously enabled out-of-band on dev DBs but untracked).

| Endpoint | Returns |
|---|---|
| `GET /admin/taxonomy/coverage` | Per-axis verified vs new vs missing, fully-VERIFIED vacancy count, per-vacancy skill-coverage histogram, required-vs-optional split, per-source breakdown. |
| `GET /admin/taxonomy/queue?type=ROLE\|SKILL\|DOMAIN&limit=N` | NEW nodes ranked by `vacancies_blocked` (`SKILL` via `vacancy_nodes`; `ROLE`/`DOMAIN` via the column on `vacancies`). `type` is optional — omit for an interleaved cross-type queue. |
| `GET /admin/taxonomy/nodes/:id` | Node + aliases + linked-vacancy count + 5 sample vacancy titles. |
| `GET /admin/taxonomy/nodes/:id/fuzzy-matches` | Trigram suggestions within the same type. Per-type threshold matrix: `ROLE`/`DOMAIN` `minLen=4 minSim=0.55`; `SKILL` `minLen=3 minSim=0.65 minWordSim=0.5` (extra `word_similarity` gate respects token boundaries). Length floor suppresses punctuation-driven false positives (`"C" → "C++"` / `"C#"` at sim=1.0). |

No auth on these routes yet — gate behind a guard before exposing beyond localhost.

### Tier 1 nodes.json iteration (commit `eaf46ac`)

First moderation pass driven by the gap report. Aliases on existing canonicals + new entries for missing concepts that were blocking ≥2 vacancies each.

Coverage delta against 142 loaded vacancies:

| Axis | Before | After | Δ |
|---|---|---|---|
| ROLE verified | 64.1 % | 97.2 % | +33pp |
| DOMAIN verified | 53.5 % | 88.0 % | +34pp |
| SKILL verified | 53.0 % | 63.4 % | +10pp |
| Fully-VERIFIED vacancies | 5 (3.5 %) | 13 (9.2 %) | 2.6× |

Skill-coverage histogram: `100%` bucket 6 → 13, `0%` bucket 6 → 1. SKILL stays long-tail-dominated — Tier 2+ iterations and a prompt-tuning pass are needed (see followups).

## Followups

- **F1 — More `nodes.json` iterations.** Tier 2 (≥1 vacancy blocked), Tier 3 (long tail). SKILL axis is gated on F2 — without prompt narrowing, the long-tail keeps regenerating. Stop when the marginal pass yields <2pp.
- **F2 — Prompt tuning.** BAML prompt currently emits a lot of soft-skill / tooling noise as `SKILL`. See [`todo/baml-extraction-prompt-tuning.md`](../../../todo/baml-extraction-prompt-tuning.md) for the plan (inject the live taxonomy as soft constraints, add anti-extraction rules, UA-market context). Measure delta via the same `fill-vacancies` coverage block.
- **F3 — Apply moderator actions.** Read-only endpoints exist; the write-path (`POST /admin/taxonomy/nodes/:id/verify`, `POST /admin/taxonomy/nodes/:id/merge → :targetId`, alias adds) hasn't shipped. Phase 2.
- **F4 — Auth on `/admin/taxonomy/*`.** Currently open. Decide on a guard (basic-auth env-token, signed cookie, dedicated admin JWT) before exposing beyond localhost.
- **F5 — Admin UI in `apps/web`.** A `/admin/taxonomy` route consuming the read endpoints (queue + node detail + fuzzy suggestions). Out of scope until F3 lands and there's something to do once a moderator opens a node.
- **F6 — Promote `fill-vacancies` to a Temporal workflow** (mirrors the `extract-missing` followup F in `rss-schedule-followups.md`). Today it's a one-shot CLI; once the loader runs in production this becomes the formal recovery path.

## Decisions (locked)

- **Strict alias matching, no fuzzy / no semantic at load time.** Fuzzy is a moderation-tool concern (suggest merges), not a loader concern. The loader writes `status='NEW'` and walks away.
- **`(name, type)` is the alias identity.** Same surface form (`"AI"`, `"smart contracts"`) may resolve to different nodes per type.
- **All seeded nodes are `VERIFIED`.** The loader never writes `VERIFIED`; only seed + future moderator action does.
- **`nodes.json` is the source of truth, not the DB.** Re-seeding is idempotent (`onConflictDoNothing` on `(name, type)`); to add aliases that were already taken by a `NEW` node you must wipe → seed → fill in that order — see commit `eaf46ac` workflow note.

## Out of scope

- Cross-source / fingerprint dedup of vacancies (separate initiative — loader-pipeline followup).
- Embedding-based node clustering / `node_vector`.
- ltree node hierarchy (`Cloud → AWS → AWS Lambda`).
- Bulk import from external taxonomies (LinkedIn skills, ESCO, etc.).

## Links

- Loader (write path that creates NEW nodes): [`_done/loader-pipeline.md`](_done/loader-pipeline.md).
- Vacancies API consumer (filters NEW out by default): [`vacancies-api.md`](vacancies-api.md).
- Source-of-truth seed: `libs/database/seeds/data/nodes.json` (~3.4k lines, 360 canonical names).
- Coverage CLI: `apps/etl/scripts/fill-vacancies.ts`.
- Admin endpoints: `apps/etl/src/taxonomy/taxonomy.controller.ts`.
- Prompt-tuning followup: [`todo/baml-extraction-prompt-tuning.md`](../../../todo/baml-extraction-prompt-tuning.md).
