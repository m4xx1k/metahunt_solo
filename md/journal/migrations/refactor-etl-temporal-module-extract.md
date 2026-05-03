# Refactor — ETL Temporal extract + RssScheduler split

**Started:** 2026-05-03 · **Branch:** `refactor/etl-temporal-module-extract` · **Status:** in progress

`RssModule` failed SRP three ways (RSS feature wiring **and** Temporal worker bootstrap **and** webpack bundler config). `RssSchedulerService` failed SRP three ways (schedule install **and** workflow kickoff **and** in-process backfill). This branch decomposes both. Closes group **D1** of [`rss-schedule-followups.md`](./rss-schedule-followups.md).

## Steps

| # | Theme | Status |
|---|---|---|
| 1 | Extract Temporal worker config out of `RssModule` into a `TemporalInfraModule` | done |
| 2 | Split `RssSchedulerService` into scheduler + ingest + backfill services | pending |

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

`RssSchedulerService` (181 LOC) does three things; the spec (270 LOC) is already split by `describe` blocks, so the test split is mechanical.

**Plan:**
- `RssSchedulerService` keeps `onApplicationBootstrap` + `ensureSchedule` only. Drops `RssExtractActivity` + `DRIZZLE` deps.
- `RssIngestService` (new) — `ingestAll` / `ingestRemote` / private `startWorkflows`. Deps: `TemporalService` + `DRIZZLE`.
- `RssBackfillService` (new) — `extractMissing`. Deps: `RssExtractActivity` + `DRIZZLE`.
- `RssController` injects `RssIngestService` and `RssBackfillService` directly (drops `RssSchedulerService` from the controller).
- Spec split: `rss-scheduler.service.spec.ts` keeps `ensureSchedule` only; new `rss-ingest.service.spec.ts` and `rss-backfill.service.spec.ts` take the rest.

## Resume here

If picking this up: confirm Step 1 has shipped (`git log --oneline | grep "TemporalInfraModule"`), then execute Step 2 per plan above. After Step 2, mark D1 `done` in `rss-schedule-followups.md` and close this tracker (move to `_done/`).

## Outcome

_(none yet — close this section once Step 2 is verified)_
