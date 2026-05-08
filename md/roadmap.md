# Roadmap

What's now / what's next. Stages are business-meaningful milestones, not small features. Small features go into `journal/releases.md`.

## Current stage

### Stage 05 — Silver layer (loader + `/vacancies` + curated taxonomy)
**Status:** in-progress · **Started:** 2026-05-05

Bronze (`rss_records`) → silver (`vacancies` + `companies` + `nodes`). Vacancies surfaced via a public read API and a web feed. Taxonomy seeded and instrumented for moderator-driven curation.

**Scope:**
- Per-vacancy pipeline workflow that loads silver from each extracted bronze record (loader-pipeline) — **done**.
- `GET /vacancies` API + `apps/web` `/vacancies` page reading the silver feed — **MVP shipped**, contract followups carried forward.
- Curated `nodes` taxonomy: type-scoped aliases, gap-driven iteration on `nodes.json`, read-only admin endpoints under `/admin/taxonomy/*` — **Phase 1 backend in**, Tier 1 nodes.json iteration in; further iterations gated on extraction prompt tuning (Stage 06).

**Out of scope for this stage:** moderator write-path API, admin UI in `apps/web`, cross-source / fingerprint dedup, embeddings.

**Trackers:**
- [`journal/migrations/_done/loader-pipeline.md`](./journal/migrations/_done/loader-pipeline.md)
- [`journal/migrations/vacancies-api.md`](./journal/migrations/vacancies-api.md)
- [`journal/migrations/taxonomy-curation.md`](./journal/migrations/taxonomy-curation.md)

## Next

### Stage 06 — Extraction quality (planned)
The BAML migration shipped 2026-05-01 ([ADR-0004](./journal/decisions/0004-baml-vacancy-extraction.md)); what's left is closing the prompt-quality loop. Inject the live taxonomy as soft constraints, add anti-extraction rules + UA-market context, regression-test against captured fixtures, and re-measure delta via `fill-vacancies` coverage. Brief: [`todo/baml-extraction-prompt-tuning.md`](../todo/baml-extraction-prompt-tuning.md). Unblocks further `nodes.json` iterations on the SKILL axis.

### Stage 07 — Quality baseline (planned)
Lint/format, unit + integration tests, and CI checks for build + migrate + seed + healthz smoke. Sequenced after Stage 06 — prompt quality drives the extraction signal that the silver layer depends on, which the CI in turn protects.

## Done

### Stage 04 — First ETL job
**Status:** done · **Completed:** 2026-05-03

First pull source (DOU + Djinni) end-to-end through the RSS+Temporal pipeline, BAML-typed extraction, scheduled hourly via Temporal Schedule (06:00–22:00 Europe/Kyiv, overlap `SKIP`), aggregated `/healthz` (Postgres + S3 + Temporal), deployed on Railway. Frontend imported into the monorepo and first read-only `/monitoring` UI shipped late in the stage.

Trackers — [`journal/migrations/_done/rss-temporal.md`](./journal/migrations/_done/rss-temporal.md), [`journal/migrations/rss-schedule-followups.md`](./journal/migrations/rss-schedule-followups.md), [`journal/migrations/_done/frontend-migration.md`](./journal/migrations/_done/frontend-migration.md). Decisions — [ADR-0003 Temporal](./journal/decisions/0003-temporal-orchestration.md), [ADR-0004 BAML](./journal/decisions/0004-baml-vacancy-extraction.md), [ADR-0005 Vercel](./journal/decisions/0005-vercel-for-frontend.md).

### Stage 03 — Env & config
**Status:** done · **Completed:** 2026-04-26

- server-compatible env flow (`process.env` first, local `.env` fallback at process start)
- Railway deployment baseline: Dockerfile build, pre-deploy migrations, and documented runbook
- production wiring for ETL + Postgres in Railway (`DATABASE_URL`, `NODE_ENV`)

### Stage 02 — Database core
**Status:** done · **Completed:** 2026-04-26

Drizzle ORM on top of `pg` in `libs/database`, schema (`sources`, `rss_ingests`, `rss_records`), migrations via `drizzle-kit`, local Postgres in Docker (port `54322`).

### Stage 01 — Foundation
**Status:** done · **Completed:** 2026-04-26

- pnpm workspaces (`apps/*`, `libs/*`)
- `@metahunt/etl` + `@metahunt/database` package split
- root and package scripts for build/dev/start
- engineering docs baseline (`md/`, ADRs)
