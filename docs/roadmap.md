# Roadmap

What's now / what's next. Stages are business-meaningful milestones, not small features. Small features go into `journal/releases.md`.

## Current stage

### Stage 04 — First ETL job
**Status:** in-progress · **Started:** 2026-04-26

First pull source (DOU or Djinni), normalize → write to DB, basic dedup. Here we revisit the HTTP wrapper around etl (see ADR-0002).

**Scope:**
- ingest a first real source end-to-end
- normalize records into the current DB schema
- verify dedup baseline and minimal observability for runs

**Out of scope for this stage:** full CI pipeline and broad quality automation (Stage 05).

## Next

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

### Stage 03 — Env & config
**Status:** done · **Completed:** 2026-04-26

- server-compatible env flow (`process.env` first, local `.env` fallback at process start)
- Railway deployment baseline: Dockerfile build, pre-deploy migrations, and documented runbook
- production wiring for ETL + Postgres in Railway (`DATABASE_URL`, `NODE_ENV`)
