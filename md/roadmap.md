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

**Execution:** the work is broken into 14 isolated, individually testable tasks (T0–T13). Orchestration choice and the per-task tracker live in [ADR-0003](./journal/decisions/0003-temporal-orchestration.md) and [`journal/migrations/rss-temporal.md`](./journal/migrations/rss-temporal.md). **Progress: 13 / 14.** Done — T0–T9 (Jest, vacancy-filter, parser, storage+MinIO, Temporal+SDK, all 4 activities, workflow), T10 RssSchedulerService (two-method API, no boolean), T11 RssController (GET /rss → 202 + ingestAll), T12 AppModule wiring (RssModule + ExtractionModule + StorageModule, workflowsPath via assets-rule + workflows/index.ts barrel, autoStart gated on NODE_ENV!=='test'). Plus an out-of-scope but deploy-critical addition: aggregated `GET /healthz` controller (Postgres + S3 + Temporal). Next — **T13 (E2E smoke verification)**: locally green via curl + Temporal UI; production smoke happens on the first Railway deploy.

## Next

### Stage 05 — Quality baseline (planned)
Lint/format, unit/integration tests, and CI checks for build + migrate + seed + health smoke.

### Stage 06 — Extraction quality (planned)
Move the vacancy extractor onto BAML (started 2026-05-01, see [ADR-0004](./journal/decisions/0004-baml-vacancy-extraction.md)) and expand it: prompt iteration via `baml-cli test` fixtures, regression tests against captured vacancies, sunset of the legacy `OpenAiVacancyExtractor` once parity is proven in production.

## Done

### Stage 01 — Foundation
**Status:** done · **Completed:** 2026-04-26

- pnpm workspaces (`apps/*`, `libs/*`)
- `@metahunt/etl` + `@metahunt/database` package split
- root and package scripts for build/dev/start
- engineering docs baseline (`md/`, ADRs)

### Stage 02 — Database core
**Status:** done · **Completed:** 2026-04-26

Drizzle ORM on top of `pg` in `libs/database`, schema (`sources`, `rss_ingests`, `rss_records`), migrations via `drizzle-kit`, local Postgres in Docker (port `54322`).

### Stage 03 — Env & config
**Status:** done · **Completed:** 2026-04-26

- server-compatible env flow (`process.env` first, local `.env` fallback at process start)
- Railway deployment baseline: Dockerfile build, pre-deploy migrations, and documented runbook
- production wiring for ETL + Postgres in Railway (`DATABASE_URL`, `NODE_ENV`)
