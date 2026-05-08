# RSS schedule — follow-ups

**Started:** 2026-05-03 · **Stage:** post-04 · **Branch (parent work):** `main` (workflow-scheduler session)

Catalog of improvements deferred from the schedule + extract-missing landing on 2026-05-03 (see [release notes](../releases.md#2026-05-03)). Each group below can ship independently; status starts `pending` and flips on close.

## Groups

| ID | Theme | Severity | Status |
|---|---|---|---|
| A | Production hardening (auth, concurrency, rate limit) | high | pending |
| B | Code quality cleanups | low | pending |
| C | Schema semantics (`rss_ingests.error_message` overload) | medium | pending |
| D | Service decomposition | medium | D1 done (`refactor/etl-temporal-module-extract`); D2 pending |
| E | Workflow test coverage | low | pending |
| F | Promote `extract-missing` HTTP endpoint to a Temporal workflow | medium | pending |
| G | Runbook tweak — schedule pause preservation | low | pending |

---

## A — Production hardening

**Why first:** the schedule fires unattended in prod; everything else is a quality-of-life or correctness concern that doesn't bleed money or burn rate-limits.

- **A1. Auth on admin HTTP endpoints.** `GET /rss` and `POST /rss/extract-missing` are unauthenticated. With `?limit=500` an anonymous caller can trigger 500× LLM calls. Add an auth guard (Bearer token or `INTERNAL_API_TOKEN` header) to both. (`apps/etl/src/rss/rss.controller.ts:15`)
- **A2. Bounded concurrency in `extractMissing`.** Currently sequential `for` loop → `limit=500` × ~1.5s = ~12 min, blocks the HTTP request. Either bound parallel calls (p-limit at 5) and keep response synchronous, or switch to fire-and-forget with a status query endpoint. Document the timeout/cost tradeoff in the controller JSDoc. (`apps/etl/src/rss/rss-scheduler.service.ts:133`)
- **A3. Bounded concurrency in workflow extraction fan-out.** `Promise.allSettled(newItemIds.map(extractAndInsert))` runs all extractions concurrently. At 50+ new items per source per fire (Djinni/DOU scale), OpenAI may rate-limit. Add a workflow-level concurrency cap (Temporal SDK has no built-in; use a sliding window or chunked `Promise.allSettled`). (`apps/etl/src/rss/workflows/rss-ingest.workflow.ts:40`)

---

## B — Code quality cleanups

Small, isolated. Group into one PR or sneak into related work.

- **B1. Hardcoded task queue in `startWorkflows`.** `taskQueue: "rss-ingest"` literal at `apps/etl/src/rss/rss-scheduler.service.ts:177` while `ensureSchedule` reads `TEMPORAL_TASK_QUEUE` from config. Pre-existing. Inject `ConfigService.get('TEMPORAL_TASK_QUEUE')` here too.
- **B2. Shared timestamp formatter.** `formatStamp` in `rss-ingest-all.workflow.ts:19-21` and the in-line stamp in `rss-scheduler.service.ts:171-174` both flatten ISO 8601 with similar regexes. Extract one util in `apps/etl/src/rss/utils/format-stamp.ts` and import from both. (Activities and workflows can share a util as long as it's pure.)
- **B3. Padding helper in schedule description.** `String(SCHEDULE_HOUR_START).padStart(2, "0")` repeated twice in `rss-scheduler.service.ts:81-86`. Local helper `pad2 = (n: number) => …`.
- **B4. `parseLimit` placement.** Currently module-scope in `rss.controller.ts:40`. Could be a private static on the controller class (or a Nest `ParseIntPipe` with bounds). Stylistic.
- **B5. `configValues` mutation in scheduler spec.** `rss-scheduler.service.spec.ts` mutates `configValues.RSS_INGEST_INTERVAL_HOURS = 2` inside one test; reset in `beforeEach`. Works, but state mutation across tests is fragile. Snapshot config at service construction or pass overrides per `bootstrap()` call.

---

## C — Schema semantics: `rss_ingests.error_message` overload

After 2026-05-03, the column is written for *both*:
- `status='failed'` → the actual exception message.
- `status='completed'` → partial-success note `"extracted=X/Y (failures=N)"` when the extraction fan-out had any rejections (`apps/etl/src/rss/workflows/rss-ingest.workflow.ts:55`).

Mixing two shapes in one column hurts triage queries (`SELECT … WHERE error_message IS NOT NULL` no longer means "failed").

**Options:**
- **C1.** Add a `note text` column to `rss_ingests`; route partial-success messages there; keep `error_message` for failures. Drizzle migration + small change to `RssFinalizeActivity`.
- **C2.** Cheaper interim: prefix the partial-success note with `"OK: "` so you can grep/regex apart. No migration.

Pick one. C1 is the right shape long-term.

---

## D — Service decomposition

- **D1. Split `RssBackfillService`. _Done 2026-05-03_ on `refactor/etl-temporal-module-extract`** — `RssSchedulerService` now owns only schedule install; `RssIngestService` owns `ingestAll` / `ingestRemote`; `RssBackfillService` owns `extractMissing`. See [tracker](./_done/refactor-etl-temporal-module-extract.md). Same branch also extracted Temporal worker config out of `RssModule` into `TemporalInfraModule`.
- **D2. Extract activity body into a pure service.** `extractMissing` calls `RssExtractActivity.extractAndInsert` directly via Nest DI even though it's an `@Activity()`-decorated class. Works because that activity has no `activityInfo()` dependency, but it's a leaky abstraction. Refactor: pure `VacancyExtractionService.extractRecord(id)` that both `RssExtractActivity` and the backfill consume.

---

## E — Workflow test coverage

No unit tests for `rssIngestWorkflow` or `rssIngestAllWorkflow`. Pre-existing repo pattern (only activities tested). Workflow logic now includes non-trivial branches: stamp formatting, fan-out, partial-failure note construction, schedule-driven path.

- **E1. Add `TestWorkflowEnvironment`.** Use `@temporalio/testing#TestWorkflowEnvironment.createTimeSkipping()` to spec:
  - `rssIngestAllWorkflow` formats child IDs as `rss-ingest-<code>-<stamp>`.
  - `rssIngestWorkflow` finalizes `completed` even when extraction rejects, with the right note shape.
  - Schedule integration: install → trigger → assert `rssIngestAllWorkflow` and N child `rssIngestWorkflow` runs.

---

## F — Promote `extract-missing` to a Temporal workflow

The HTTP endpoint `POST /rss/extract-missing` is a quick-fix one-shot. Long-term, backfill should be:

- **F1. `rssBackfillExtractWorkflow(limit)`** that lists null records via an activity, fans out child `extractRecord` workflows or activities. Inherits the activity retry policy (3× exp backoff) for free; runs are tracked in Temporal UI; can be scheduled (e.g. nightly catch-up at 03:00 Europe/Kyiv off-window).
- **F2. Migrate the controller** to start that workflow instead of running in-process. Or replace with a simple `temporal workflow start` CLI invocation in a runbook step.
- **F3. Remove or gate the HTTP endpoint** behind a dev-only flag once F1 is live.

This is the Stage 06 "backfill / re-extract" item from `md/roadmap.md`.

---

## G — Runbook: schedule pause preservation

The `ensureSchedule` update path preserves `prev.state` (including `paused: true`) — so an operator who pauses the schedule via Temporal UI keeps it paused across redeploys. This is the desired behavior, but it's surprising. Add one paragraph to `md/runbook/failure-recovery.md` (under "Pausing the schedule") explicitly stating that redeploys do NOT auto-unpause; you must `temporal schedule unpause` (or hit the UI button).

---

## Outcome

_(none yet)_

---

## Resume here

When picking up: read the group you're touching, check that file:line references still resolve (they may have drifted), then create a slug branch (`feat/rss-schedule-A1-auth`, `chore/rss-schedule-B1-taskqueue`, etc.) and ship. Remove the closed group from the table above and write a one-line outcome here.
