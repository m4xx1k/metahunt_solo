# Roadmap

What's now / what's next. Stages are business-meaningful milestones, not small features. Small features go into `journal/releases.md`.

## Current stage

### Stage 03 — Env & config
**Status:** in-progress · **Started:** 2026-04-26

Stabilize configuration flow and runtime ergonomics now that DB core is in place.

**Scope:**
- server-compatible env handling (`process.env` first, local `.env` fallback at process start)
- typed config boundaries for app/database
- documentation cleanup for operational consistency

**Out of scope for this stage:** full Joi schema validation, CI, lint/format/tests.

## Next

### Stage 04 — First ETL job (planned)
First pull source (DOU or Djinni), normalize → write to DB, basic dedup. Here we revisit the HTTP wrapper around etl (see ADR-0002).

### Stage 05 — Quality baseline (planned)
Lint/format, unit/integration tests, and CI checks for build + migrate + seed + health smoke.

## Done

### Stage 01 — Foundation
**Status:** done · **Completed:** 2026-04-26

- pnpm workspaces (`apps/*`, `libs/*`)
- `@metahunt/etl` + `@metahunt/database` package split
- root and package scripts for build/dev/start
- engineering docs baseline (`docs/`, ADRs)

### Stage 02 — Database core
**Status:** done · **Completed:** 2026-04-26

Drizzle ORM on top of `pg` in `libs/database`, schema (`sources`, `rss_ingests`, `rss_records`), migrations via `drizzle-kit`, local Postgres in Docker (port `54322`).
