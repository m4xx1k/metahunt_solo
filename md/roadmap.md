# Roadmap

What's now / what's next. Stages are business-meaningful milestones, not small features. Small features go into `journal/releases.md`.

## Current stage

### Stage 08 — First-user validation
**Status:** in-progress · **Started:** 2026-07-21

The candidate-facing loop now exists end to end: browse or CV match → Telegram
subscription → new-vacancy digest → attributed original-job click. The current
stage validates that loop with real people before more ranking or source work.

**Now:** ship the first-party activation ledger and operator funnel dashboard,
run one post-deploy correlation proof, then complete five controlled Telegram
activation chains and recruit 20 Middle/Senior Backend or Full-stack users.
Paid traffic remains gated on that cohort's activation and alert-quality results.

Tracker: [`real-user-funnel`](./journal/migrations/real-user-funnel.md). Launch
plan: [`METAHUNT_AUDIT_AND_NEXT_STEPS.md`](../METAHUNT_AUDIT_AND_NEXT_STEPS.md).

## Next

### Stage 09 — Evidence-led quality calibration

Use first-user relevance ratings, zero-match rates, link conversion, and digest
clicks to choose the next ranking, extraction, taxonomy, or supply improvement.
Do not select that work from offline intuition alone.

## Done

### Stage 07 — Launch quality baseline
**Status:** done · **Completed:** 2026-07-21

Lint, tests, production builds, migration verification, health smoke, API/CV
privacy hardening, CORS restriction, ingest correctness, and Telegram-link race
handling are protected in CI and deployed on the production API.

### Stage 06 — Extraction quality + candidate/operator surfaces
**Status:** done · **Completed:** 2026-07-11

Prompt v2 and extraction-cost visibility, the operator workspace, reverse-ATS,
CV skill recommendations, stack-fit ranking, the merged home feed, Telegram
auth, account-bound CVs, and subscription management shipped. Empirical prompt
delta and role-fit calibration were deliberately deferred until Stage 09, when
real usage can provide the missing evidence.

Key trackers: [`_done/extraction-prompt-v2.md`](./journal/migrations/_done/extraction-prompt-v2.md),
[`reverse-ats.md`](./journal/migrations/reverse-ats.md), and
[`_done/operator-dashboard.md`](./journal/migrations/_done/operator-dashboard.md).

### Stage 05 — Silver layer (loader + `/vacancies` + curated taxonomy)
**Status:** done · **Completed:** 2026-05-08

Bronze (`rss_records`) → silver (`vacancies` + `companies` + `nodes`). Vacancies surfaced via a public read API and a web feed. Taxonomy seeded and instrumented for moderator-driven curation.

**Scope:**
- Per-vacancy pipeline workflow that loads silver from each extracted bronze record (loader-pipeline) — **done**.
- `GET /vacancies` API + `apps/web` `/vacancies` page reading the silver feed — **MVP shipped**, contract followups carried forward.
- Curated `nodes` taxonomy: type-scoped aliases, gap-driven iteration on `nodes.json`, read-only admin endpoints under `/admin/taxonomy/*` — **Phase 1 backend in**, Tier 1 nodes.json iteration in; further iterations gated on extraction prompt tuning (Stage 06).

**Out of scope for this stage:** moderator write-path API, cross-source / fingerprint dedup, embeddings. Read-only operator dashboard ([`operator-dashboard`](./journal/migrations/_done/operator-dashboard.md)) shipped under Stage 06 as Phase 1.5 of taxonomy-curation.

**Trackers:**
- [`journal/migrations/_done/loader-pipeline.md`](./journal/migrations/_done/loader-pipeline.md)
- [`journal/migrations/vacancies-api.md`](./journal/migrations/vacancies-api.md)
- [`journal/migrations/taxonomy-curation.md`](./journal/migrations/taxonomy-curation.md)

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
