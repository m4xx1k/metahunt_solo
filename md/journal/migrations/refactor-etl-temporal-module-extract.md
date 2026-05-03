# Refactor — ETL Temporal extract + RssScheduler split

**Started:** 2026-05-03 · **Closed:** 2026-05-03 · **Branch:** `refactor/etl-temporal-module-extract` · **Status:** done

`RssModule` failed SRP three ways (RSS feature wiring **and** Temporal worker bootstrap **and** webpack bundler config). `RssSchedulerService` failed SRP three ways (schedule install **and** workflow kickoff **and** in-process backfill). This branch decomposes both. Closes group **D1** of [`rss-schedule-followups.md`](./rss-schedule-followups.md).

## Steps

| # | Theme | Status |
|---|---|---|
| 1 | Extract Temporal worker config out of `RssModule` into a `TemporalInfraModule` | done |
| 2 | Split `RssSchedulerService` into scheduler + ingest + backfill services | done |

## Step 1 — TemporalInfraModule

**Files added:**
- `apps/etl/src/temporal/temporal.module.ts` — owns `TemporalModule.registerAsync(...)`.
- `apps/etl/src/temporal/webpack-workflow.hook.ts` — extracted `appendTsLoaderRule`.
- `apps/etl/src/rss/activities/index.ts` — barrel exporting `RSS_ACTIVITIES` so the worker registration and the Nest `providers` list never drift.

**Files modified:**
- `apps/etl/src/app.module.ts` — imports `TemporalInfraModule`.
- `apps/etl/src/rss/rss.module.ts` — 95 → 22 lines, single responsibility.

**Verification:** `pnpm exec tsc --noEmit` clean; `pnpm test` 13 suites / 55 tests pass, including `app.module.spec.ts` (full DI graph compile).

**Behavior parity:** `workflowsPath` resolves to the same absolute path; Temporal config is otherwise byte-equivalent.

## Step 2 — split RssSchedulerService

**Files added:**
- `apps/etl/src/rss/rss-ingest.service.ts` — owns `ingestAll` / `ingestRemote` / private `startWorkflows`. Deps: `TemporalService` + `DRIZZLE`.
- `apps/etl/src/rss/rss-backfill.service.ts` — owns `extractMissing`. Deps: `RssExtractActivity` + `DRIZZLE`.
- `apps/etl/src/rss/rss-ingest.service.spec.ts`, `rss-backfill.service.spec.ts` — focused specs.

**Files modified:**
- `apps/etl/src/rss/rss-scheduler.service.ts` — 181 → 102 lines, owns only `onApplicationBootstrap` + `ensureSchedule`. Dropped `RssExtractActivity` + `DRIZZLE` deps.
- `apps/etl/src/rss/rss-scheduler.service.spec.ts` — keeps `ensureSchedule` cases only; ingest + backfill cases moved to focused specs.
- `apps/etl/src/rss/rss.controller.ts` — injects `RssIngestService` + `RssBackfillService` directly.
- `apps/etl/src/rss/rss.module.ts` — registers the two new providers.

**Verification:** `pnpm exec tsc --noEmit` clean; `pnpm test` 15 suites / 55 tests pass.

## Outcome

`RssModule` and `RssSchedulerService` each pass the SRP "name without `and`" test. Adding a second ingest source no longer touches Temporal infra; adding a new backfill flow doesn't touch the scheduler. Group **D1** in [`rss-schedule-followups.md`](./rss-schedule-followups.md) is closed. The hardcoded `taskQueue: "rss-ingest"` in `RssIngestService.startWorkflows` (group **B1**) is unchanged — out of scope for this branch.

## Resume here

This tracker is closed. Maintainer: move to `md/journal/migrations/_done/` on merge. For the broader follow-up backlog see [`rss-schedule-followups.md`](./rss-schedule-followups.md).
