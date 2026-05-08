# ADR-0003 — Temporal as the orchestrator for RSS ingest

**Status:** accepted
**Date:** 2026-04-27
**Context (in time):** Stage 04
**Supersedes:** the open question in ADR-0002 about cron vs Temporal for ETL.

## Context

ADR-0002 left the orchestration choice open: *"if jobs are few/infrequent, grow into `@nestjs/schedule`; if many/heavy, split into a Temporal worker."* Stage 04 (first ETL job) makes the call concrete. The legacy prototype `_metahunt/` already has a working Temporal-based pipeline (4 activities + workflow + scheduler + controller), and `apps/etl/src/config/env.validation.ts` already declares `TEMPORAL_ADDRESS`/`TEMPORAL_NAMESPACE`/`TEMPORAL_TASK_QUEUE`. So both options are realistic — choosing now sets the shape for all later ETL work.

## Options

### Option A — `@nestjs/schedule` only
- ✅ no extra infra (no Temporal server, no webpack workflow-bundler, no worker process)
- ✅ smallest deps surface
- ❌ retries, timeouts, observability, restart-from-step — all hand-rolled
- ❌ no execution history, no UI for runs — debugging a failed ingest means tailing logs
- ❌ rewrite of the legacy pipeline (which is Temporal-shaped today)

### Option B — Full Temporal (`nestjs-temporal-core` + `@temporalio/*`)
- ✅ retries, timeouts, error classification per activity for free
- ✅ Temporal UI gives per-run history out of the box — matches "minimal observability" goal of Stage 04
- ✅ ~90% of legacy code ports 1:1 (only path-alias rewrites)
- ❌ adds Temporal server to docker-compose, plus webpack workflow-bundler with `ts-loader`
- ❌ the workflow-bundler path discipline (`apps/etl/src/rss/workflows/*` must be deterministic) constrains future refactors

### Option C — Hybrid: keep activity-shaped services but drive them from `@nestjs/schedule`
- ✅ activities stay isolated and unit-testable
- ❌ doesn't give us retries/observability — same drawbacks as A
- ❌ implies a future second migration to "real" Temporal — two ports for one feature

## Decision

**Option B — Temporal.** The retry/observability story is what makes Stage 04 *"first ETL job with minimal observability"* viable without writing custom infra. The legacy pipeline already encodes this shape, so the cost of adoption is mostly infra plumbing (docker-compose + worker bundler) rather than code design.

We accept the docker-compose footprint and the workflow-bundler quirk as the price.

## Consequences

- New runtime deps in `@metahunt/etl`: `nestjs-temporal-core`, `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`. New devDep: `ts-loader` (for the workflow webpack hook).
- `docker-compose.yml` grows two services: a Temporal server (e.g. `temporalio/auto-setup`) and the Temporal Web UI.
- Workflows live at a fixed path — `apps/etl/src/rss/workflows/*.ts` — bundled by webpack with `ts-loader` (`transpileOnly: true`).
- The "ETL inside the HTTP app" scaffold from ADR-0002 stays as-is: the worker auto-starts inside the same Nest process. If load grows, we split into a `apps/worker` later — that future ADR will supersede this one.
- Concrete migration steps and current progress are tracked in [`journal/migrations/_done/rss-temporal.md`](../migrations/_done/rss-temporal.md).
