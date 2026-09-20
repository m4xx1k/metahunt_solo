# queue-migration — Temporal → BullMQ, with engine-free business logic

**Branch:** `refactor/queue-migration`
**Status:** planned
**Started:** 2026-09-16

## Outcome

Replace Temporal with BullMQ + Redis, and in the same move put every pipeline step behind a
plain service method that knows nothing about the queue. After this, re-extract, reprocess,
and backfill are the *same* method calls the scheduler makes — not a second runtime.

## Executive decision — supersedes "Keep Temporal"

[`ingest-pipeline-refactor.md`](./ingest-pipeline-refactor.md) decided **Keep Temporal** on
2026-07-21. That decision is **reversed on 2026-09-16**. Reason: the cost was never the server,
it was the programming model — a webpack workflow bundler, a determinism constraint the ADR itself
lists as a drawback, two containers, and a private Postgres schema, all to run three cron jobs and
a two-level fan-out. Audit of the code found Temporal-specific semantics in exactly one place
(`startChild` with `ALLOW_DUPLICATE_FAILED_ONLY`), and that is replaceable by domain state we
already keep.

That tracker stays valid for everything else. This migration delivers, as a side effect, the
vocabulary of T2, the workflow shapes of T3/T4, the split post-process of T6, and the
"recovery is the same code path" goal of T7.

## The one rule

> **Services return work. Processors dispatch work.**

A service method never enqueues. It does its unit of work and returns the IDs of the next unit.
The processor — the only file that imports BullMQ — decides what to do with them.

This single rule buys all of:

- business logic testable with no Redis and no queue;
- the whole pipeline runnable synchronously in one test or one CLI command;
- reprocess/re-extract as ordinary calls, not a parallel implementation;
- swapping the queue again later touching five files.

Corollary: **no service takes a `Job`, a `Queue`, or anything BullMQ-typed as a parameter.**

## Layer map

```
apps/etl/src/platform/queue/          ← the ONLY place importing bullmq
  queue.module.ts                     registration, Redis connection, graceful shutdown
  queue.names.ts                      queue + job name constants
  queue.config.ts                     concurrency / retry / cron — single source of truth
  queue-schedules.service.ts          installs repeatable jobs on boot
  processors/*.processor.ts           5 thin processors: call service, enqueue what it returned

apps/etl/src/01-ingest/rss/
  ingest-cycle.service.ts             ← was rssIngestAllWorkflow
  source-ingest.service.ts            ← was rssIngestWorkflow body + rss-fetch/parse activities
apps/etl/src/02-enrich/
  record-process.service.ts           ← was rss-extract activity + vacancyPipelineWorkflow
  dedup/post-process.service.ts       ← was dedupSweep activity, split into steps
apps/etl/src/04-notify/telegram/
  notify-run.service.ts               ← was notifySubscribersWorkflow
```

Existing domain services (`RssParserService`, `VacancyLoaderService`, `DedupService`,
`CompanyResolverService`, repositories, `CachedVacancyExtractor`) are **not touched**. The new
services are use-case orchestrators over them — the same bodies the activities have today, moved
one directory up and stripped of the `@Activity()` decorator.

Deleted: `apps/etl/src/workflows/index.ts`, all `workflows/*.workflow.ts`, all
`activities/*.activity.ts`, `platform/temporal/*`, the three `*SchedulerService` classes.
Kept: `workflows/settle-in-batches.ts` → moves to `platform/shared/settle-in-batches.ts`.
It is a pure helper and it is exactly what the synchronous reprocess path needs.

## The five processes

Each returns a typed result. `{ ... }` is the return value the processor acts on.

### 1. `ingestCycle` — one pass over all sources

- **Input:** none (cron) or `{ sourceIds?: string[] }` (manual subset).
- **Does:** selects sources where the connector is usable (today: `rssUrl IS NOT NULL` — the
  filter `RssIngestService.ingestAll()` is missing today, which is a live bug this migration
  removes by construction).
- **Returns:** `{ cycleId, sourceIds[] }`
- **Processor then:** enqueues one `source-ingest` job per id, `jobId: source:<id>:<cycleId>`.
- **Idempotency:** `cycleId` = ISO hour bucket. Re-running the same bucket enqueues the same job
  ids, so an overlapping cron tick is a no-op instead of a double run (this is the `overlap: SKIP`
  replacement).
- **Retry:** 3 × 5s exponential. **Concurrency:** 1.
- **Note:** `refreshNodeStats` moves out of here into `post-process`, per T3.

### 2. `sourceIngest` — one acquisition attempt for one source

- **Input:** `{ sourceId, cycleId }`
- **Does:** opens an `rss_ingests` run row → fetches the feed → stores the raw snapshot in S3 →
  parses → tech-gate filter → source-scoped hash dedup → inserts new `rss_records` → closes the
  run row with counts.
- **Returns:** `{ ingestRunId, recordIds[], seen, skippedNonTech, alreadyKnown }`
- **Processor then:** enqueues one `record-process` job per id.
- **Idempotency:** run row keyed by `(sourceId, cycleId)`; snapshot key deterministic; record
  insert `onConflictDoNothing` on `(source_id, hash)`.
- **Retry:** 3 × 5s exponential, per-attempt timeout 2m. **Concurrency:** 2.
- **Trade-off accepted:** fetch and parse are one job now, so a parse failure re-fetches. The
  snapshot write is idempotent and the feed is small; not worth two queues.

### 3. `recordProcess` — one vacancy, end to end

**The important one.** This is the method every recovery path reuses.

- **Input:** `{ recordId, pipelineVersion, force?: boolean }`
- **Does:**
  1. loads the record; if already processed at this `pipelineVersion` and `force !== true` →
     returns `{ status: "skipped", reason: "already-processed" }`;
  2. **extract** — only if the connector says the payload is unstructured (today: always true for
     RSS). Goes through `CachedVacancyExtractor`, so a retry does not re-buy the same LLM call;
  3. if `isTech === false` → `{ status: "skipped", reason: "non-tech" }`. **Not an error.**
  4. **upsert listing** — company/taxonomy resolve + `vacancies` upsert in one short transaction,
     latest-wins.
- **Returns:** `{ status: "ready", listingId } | { status: "skipped", reason } | throws`
- **Idempotency:** `jobId: record:<recordId>:v<pipelineVersion>`; upsert is latest-wins keyed on
  `(source_id, external_id)`; extraction is cached by `(spec_hash, input_hash)`.
- **Retry:** 3 × 5s exponential, per-attempt timeout 3m. **Concurrency:** 5 (see budget below).
- **On final failure:** processor marks the record quarantined (this is where the tracker's
  `QuarantinedRecord` term finally gets a model — one `extraction_status` column, nothing more).

**Hard rule:** the DB connection is never held across the LLM call. Two short DB touches around a
long network call, never one transaction wrapping both. At concurrency 5 this is the difference
between fine and a drained pool.

### 4. `postProcess` — derived data

- **Input:** `{ steps?: ("embed" | "cluster" | "stats")[] }` — defaults to all.
- **Does:** `embed` and `stats` may run in parallel; `cluster` runs only after `embed`.
- **Returns:** `{ embedded, clustered, statsRefreshed, backlog }`
- **Idempotency:** embed selects `WHERE embedding IS NULL OR model != current`; clustering is
  single-writer; view refresh is repeatable.
- **Retry:** 2 × 30s. **Concurrency:** 1 (single writer).
- **Change from today:** the three steps become three separately callable methods instead of one
  opaque 30-minute activity, so a clustering failure no longer re-runs embedding. Delivers T6.
- **Remove** the hand-rolled retry loop inside `openai-embeddings.client.ts`; one retry layer only,
  owned by the queue. Keep its `Retry-After` handling by rethrowing with a computed `delay`.

### 5. `notify` — digest

- **Input:** none (cron).
- **Does:** existing digest logic, untouched. Keeps its own rate limiter and per-subscription
  idempotency key.
- **Retry:** 3 × 10s. **Concurrency:** 2.

## What this buys: reprocess for free

Every recovery scenario becomes a loop over `recordProcess.run()` with different arguments. No new
code paths, same retries, same idempotency, same visibility.

| Need | Call |
|---|---|
| Re-extract one record | `recordProcess.run({ recordId, pipelineVersion, force: true })` |
| Re-extract after a prompt change | bump `PIPELINE_VERSION`, enqueue the affected ids |
| Backfill never-extracted records | select `extracted_at IS NULL`, enqueue each |
| Re-run one source now | `sourceIngest.run({ sourceId, cycleId: "manual-<ts>" })` |
| Rebuild all clusters | `postProcess.run({ steps: ["cluster"] })` |
| Replay a whole day | select record ids by date, enqueue each |

Two entry points expose this, both thin wrappers over the same services:
`scripts/` CLI (synchronous, uses `settleInBatches`, good for a one-off) and the existing admin
HTTP endpoints (enqueue, good for production). `LoaderBackfillService` and
`/rss/extract-missing` — today a second runtime that bypasses Temporal — are **deleted** and
replaced by these. That closes T7.

## Testing

Three layers, and only the first one needs to be thorough.

**1. Business logic — where the real coverage lives.** Plain service tests against a test DB.
No Redis, no BullMQ, no mocks of the queue, because the services cannot see it.

```
recordProcess.run({ recordId, pipelineVersion: 1 })  → { status: "ready", listingId }
recordProcess.run(... same ...)                      → { status: "skipped", "already-processed" }
recordProcess.run({ ..., force: true })              → { status: "ready" } again
recordProcess.run({ recordId: nonTechRecord })       → { status: "skipped", "non-tech" }
```

Extend the existing `pnpm test:etl:int` suite; the current activity specs mostly survive as-is
since the bodies only moved.

**2. The pipeline seam — one end-to-end test, no infrastructure.** Because services return work
instead of enqueuing it, the whole pipeline runs synchronously:

```ts
const { sourceIds } = await ingestCycle.run();
for (const sourceId of sourceIds) {
  const { recordIds } = await sourceIngest.run({ sourceId, cycleId: "test" });
  for (const recordId of recordIds) await recordProcess.run({ recordId, pipelineVersion: 1 });
}
await postProcess.run();
```

Feed it the fixture RSS file and assert on `vacancies`. This is the test that actually proves the
migration did not change behaviour, and it needs zero queue setup.

**3. Queue wiring — deliberately shallow.** Do not test BullMQ; it is tested. Per processor, one
test with a stubbed service and a fake queue: *was the service called with the job's data, and were
the returned ids enqueued with the expected `jobId`?* Five small tests, done.

Redis in CI: not required for layers 1–2. Layer 3 uses a fake `Queue` object.

## Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | Cron overlap (cycle still running) | deterministic `jobId` per hour bucket → duplicate is a no-op |
| 2 | Redis loses all data | acceptable: next cron re-runs. Records stranded mid-flight are caught by #3 |
| 3 | Jobs lost / worker killed mid-flight | **reconcile job**, hourly: enqueue `record-process` for `rss_records` with `extracted_at IS NULL` older than 30m. This is the system's self-heal and it replaces `/rss/extract-missing` |
| 4 | Worker killed during deploy | `worker.close()` on SIGTERM; BullMQ returns the lock, job is retried |
| 5 | Stalled job (lock lost, no crash) | `stalledInterval: 30_000`, `maxStalledCount: 2` |
| 6 | Poison record (always fails) | exhausts attempts → `failed` set → quarantined in DB. Does not head-of-line block |
| 7 | Duplicate job for same record | `jobId` dedups while the job exists; after that, domain idempotency (`already-processed` check) is the real guard. Never rely on `jobId` alone |
| 8 | Out-of-order updates for one vacancy | latest-wins upsert, already shipped in T1 |
| 9 | Pool exhaustion | `DB_POOL_MAX` explicit; concurrency budget below; never hold a connection across a network call |
| 10 | Timezone | repeatable jobs must set `tz: "Europe/Kyiv"` — default is UTC and 06–22 Kyiv ≠ 06–22 UTC |
| 11 | Empty run (no new records) | success, not failure |
| 12 | Source with no feed configured | filtered out in `ingestCycle`; never enqueued |
| 13 | Double-processing during cutover | schedules paused before deploy; see checklist |
| 14 | `removeOnComplete` hides history | `{ count: 1000 }` — enough to debug, bounded memory |
| 15 | Clustering while listings are being written | eventual by design; feed may show an unclustered listing |

## Concurrency budget

Pool is currently `new Pool({ connectionString })` — no `max`, so **node-pg default 10**, shared
with the HTTP API in the same process. Set it explicitly and spend it deliberately:

```
DB_POOL_MAX = 20
  HTTP API reserve      8
  source-ingest         2
  record-process        5
  post-process          1
  notify                2
  headroom              2
```

Derivation, for when volume changes: required concurrency = throughput × latency. At ~100 records
per cycle closed within 5 minutes and ~3s per record, that is ≈1; the 5 above is burst headroom,
not a target. Raise only against a measured queue backlog, and never above the pool budget.

## Stages

Three. Stage 0 is 20 minutes, Stage 1 is the evening, Stage 2 is next week.

### S0 — baseline (do first, it is the only proof the migration is correct)

- [ ] Record counts before: `rss_ingests` runs/24h, `rss_records` inserted/24h, records with
      `extracted_at IS NULL`, `vacancies` total, `unique_vacancies` total, typical cycle duration.
- [ ] Save as a comment block in this file. Closes the open T0 item in the other tracker.
- [ ] Decide `PIPELINE_VERSION` starting value (`1`) and where it lives (env, validated).

### S1 — the swap (one PR, one evening)

- [ ] Add `bullmq` + `ioredis`; add Redis to `compose.infra.yaml` and to Railway.
- [ ] `platform/queue/`: module, names, config table, 5 processors, schedules service.
- [ ] Move activity bodies into the 5 use-case services. **Behaviour identical** — no renames of
      domain services, no schema changes beyond `extraction_status`.
- [ ] Add the reconcile job (edge case #3).
- [ ] Delete workflows, activities, `platform/temporal/`, the 3 scheduler services, the webpack
      hook, `LoaderBackfillService`, `/rss/extract-missing`.
- [ ] `DB_POOL_MAX` explicit; concurrency from config.
- [ ] Tests: layer 2 seam test green, layer 1 suite green, 5 wiring tests.
- [ ] **Keep** `@temporalio/*` deps and the Temporal containers installed but unused.

### S2 — remove Temporal (separate PR, ~1 week later)

- [ ] Drop `@temporalio/*`, `nestjs-temporal-core`, `ts-loader`, `TEMPORAL_*` env.
- [ ] Remove `temporal` + `temporal-ui` from compose and Railway; drop their Postgres schemas.
- [ ] Update `md/architecture/overview.md`, `md/runbook/failure-recovery.md`, ADR-0003 status →
      superseded, and this tracker's outcome; move to `_done/`.

Not in scope, deliberately: the `Connector` port, conditional extraction for structured ATS
payloads, and `sources.connectorType/connectorConfig`. `recordProcess` already has the seam for it
(step 2 is conditional), so that lands as its own tracker without touching the engine again.

## Evening ship checklist

Order matters; deviating risks double-charging the LLM budget.

1. `scripts/db-backup.sh`.
2. Record S0 baseline numbers.
3. Merge to `main`, let CI go green — **do not deploy yet**.
4. `scripts/temporal-schedules.ts pause "queue-migration cutover"` — all three schedules.
5. Wait for in-flight workflows to drain (Temporal UI → no Running).
6. Deploy. On boot, `QueueSchedulesService` installs the three repeatable jobs.
7. Trigger one manual `ingest-cycle` and watch it through: source → records → listings.
8. Compare against baseline: record count moved, listing count moved, no growth in
   `extracted_at IS NULL`.
9. Leave it for one full cycle before going to bed.

**Rollback (any step after 6):** revert the deploy, then
`scripts/temporal-schedules.ts resume` — the Temporal server, its history, and its deps are still
there because S2 has not run. Rollback is two commands and loses at most one cycle, which the next
tick re-ingests by hash dedup.

**The one thing that is not rollback-safe:** `extraction_status`. It is additive and nullable, so
the old code ignores it. Keep it that way — no `NOT NULL`, no default backfill in S1.

## Verification matrix

- Unit: `already-processed` / `non-tech` / `force` branches; cycle-bucket id; reconcile selection.
- Seam: fixture feed → listings, synchronous, no Redis.
- Wiring: each processor enqueues the ids its service returned, with expected `jobId`.
- Integration: latest-wins under a re-run; extraction cache prevents a second paid call on retry.
- Operational: kill the worker mid-record (job returns and retries); pool never exceeds budget
  under a full cycle.

## Links

- Supersedes the Temporal decision in [`ingest-pipeline-refactor.md`](./ingest-pipeline-refactor.md)
- [ADR-0003 Temporal orchestration](../decisions/0003-temporal-orchestration.md) — to be marked superseded in S2
- [Failure recovery runbook](../../runbook/failure-recovery.md) — rewritten in S2
- [Architecture snapshot](../../architecture/overview.md) — updated in S2
- PR: —
