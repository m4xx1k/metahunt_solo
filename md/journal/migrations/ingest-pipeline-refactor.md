# ingest-pipeline-refactor — readable, durable, service-ready ingest

**Branch:** `feat/ingest-pipeline-refactor`
**Status:** launch-critical slice implemented · verified locally in Docker
**Started:** 2026-07-21

## Outcome

T0/T1 launch guards are implemented without a schema migration: source-scoped fingerprints,
production-safe fetch failure handling, bounded fan-out/worker concurrency, latest-wins listing
writes, and race-safe embedding/cluster invalidation. Later architecture slices remain below.
Verified: ETL 52/306, web 3/46, integration 10/33, lint/build/migrations, Docker/Temporal smoke.

## Executive decision

Keep Temporal. Do not introduce Airflow or a second orchestrator. Refactor the pipeline around
three explicit boundaries:

1. **Acquisition** captures a source snapshot and persists new source records.
2. **Listing processing** turns one source record into one normalized source listing.
3. **Post-processing** derives embeddings, duplicate clusters, corpus statistics, and notifications.

Do not perform a large database rewrite. Preserve the current source/record/listing/cluster model.
Make correctness fixes first, then restructure workflows, then optionally extract AI attempts from
`rss_records.extracted_data` into a dedicated table.

Implementation priority is split deliberately:

- **Before public launch:** T0 and T1 correctness/reliability fixes.
- **Good portfolio-quality follow-up:** T2–T5, implemented as small reviewable PRs.
- **After users or demonstrated scale:** T6–T9 unless a concrete incident pulls them forward.

## Why this initiative exists

The current pipeline works, but names/lifecycles hide behavior: `dedup` has two meanings;
`rssIngestWorkflow` mixes acquisition, extraction, dispatch, and status; completion precedes abandoned
listing work; stats refresh races it; extraction fan-out is unbounded; backfills implement a second
runtime; `rss_records` mixes source history with mutable AI state; updated listings can retain stale
embeddings/clusters. These boundaries also obstruct eventual service extraction.

The goal is not aesthetic renaming. The goal is for workflow names, status, retries, and data
boundaries to agree, so an operator can answer "what completed?", "what failed?", and "what is safe
to replay?" without reading implementation details.

## Goals

- Make workflow files the readable orchestration map; give each activity one business outcome.
- Isolate failure per source/record and let Temporal own retries, history, and visibility.
- Make writes idempotent; bound source, LLM, embedding, and child concurrency.
- Separate core ingest from eventual derivations while preserving lineage and reprocessing.
- Invalidate derived data correctly and prepare independently scalable workers/task queues.
- Keep database changes small, additive, and reversible.

## Non-goals

- Replacing Temporal or adding Airflow/Kafka/outbox without an observed need.
- Physically renaming every `rss_*` table or building a generic connector framework immediately.
- Rewriting/calibrating semantic clustering or moving feed/ranking/Telegram/web into ingest.
- Creating separate medallion databases or making clustering a hard v1 availability dependency.

## Current implementation map

| Area | Primary files |
|---|---|
| Registry/worker | `apps/etl/src/workflows/index.ts`, `platform/temporal/temporal.module.ts` |
| Source workflows | `01-ingest/rss/workflows/rss-ingest-{all,}.workflow.ts` |
| Source activities | `01-ingest/rss/activities/rss-{list-sources,fetch,parse,extract,finalize}.activity.ts` |
| Source services | `01-ingest/rss/{rss-parser,rss-scheduler,rss-backfill}.service.ts` |
| AI contract/adapters | `02-enrich/extraction/*`, `apps/etl/baml_src/extract-vacancy.baml` |
| Listing workflow/activity | `02-enrich/loader/workflows/vacancy-pipeline.workflow.ts`, `activities/load-vacancy.activity.ts` |
| Listing domain/write | `02-enrich/loader/services/*`, `repositories/*`, `external-id/*` |
| Post-process | `02-enrich/dedup/{workflows,activities,dedup.service.ts,dedup-scheduler.service.ts}` |
| Stats/notify | `01-ingest/rss/activities/refresh-node-stats.activity.ts`, `04-notify/telegram/workflows/*` |
| Source schema | `libs/database/src/schema/{sources,rss-ingests,rss-records}.ts` |
| Listing schema | `libs/database/src/schema/{vacancies,unique-vacancies,companies,company-identifiers}.ts` |
| Taxonomy/derived | `libs/database/src/schema/{nodes,node-aliases,vacancy-nodes,node-stats,node-skill-cooc}.ts` |

## Current data flow

```text
rss-ingest-hourly → rssIngestAllWorkflow
  → listRemoteSources → ABANDON rssIngestWorkflow[source] × N → refreshNodeStats
rssIngestWorkflow → fetchAndStore → parseAndDedup
  → unbounded extractAndInsert[record] → ABANDON vacancyPipeline[record] → finalize completed
vacancyPipeline → loadVacancy
dedup-sweep → dedupSweep(embedAll → resolveAll); tg-digest-daytime → notifySubscribers
```

## Confirmed correctness risks

| ID | Risk | Evidence/consequence |
|---|---|---|
| C1 | Cross-source exact suppression | `rss-parse.activity.ts` hash lookup omits `source_id`; DB uniqueness includes it |
| C2 | Fixture masks outage | `rss-fetch.activity.ts` catches all remote failures and reads stale local XML |
| C3 | Misleading completion | source run completes after abandoned listing children merely start |
| C4 | Overlap leaks to descendants | fast-closing all-source parent does not bound abandoned source/record work |
| C5 | Unbounded LLM fan-out | `Promise.allSettled(newItemIds.map(...))`; also tracked in `rss-schedule-followups.md` A3 |
| C6 | Stale derived listing state | upsert leaves embedding/group; embed selection misses changed current-model rows |
| C7 | Old backfill wins | listing conflict update has no observation-order guard |
| C8 | Attempt history lost | `_usage`/`_error` share overwritten `rss_records.extracted_data` JSON |
| C9 | Recovery is a second runtime | backfill loops bypass Temporal durability/retries/visibility |

## Ubiquitous language

Use these terms in workflow names, activity names, DTOs, logs, dashboards, and future ADRs. Database
table names may remain legacy names during the first migration.

| Term | Definition | Current representation |
|---|---|---|
| `Source` | Configured external provider such as DOU or Djinni | `sources` |
| `Connector` | Transport/source adapter: RSS now, ATS/API/scraper later | implicit RSS code |
| `IngestCycle` | One scheduled/manual attempt across a set of sources | all-source workflow only |
| `SourceIngestRun` | One acquisition attempt for one source | `rss_ingests` + source workflow |
| `RawSnapshot` | Immutable payload durably captured from a source | object storage XML |
| `SourceItem` | Connector-specific parsed item before persistence | `RawRssItem` |
| `ExternalListingKey` | Stable source-local identity `(sourceId, externalId)` | listing unique key |
| `ContentFingerprint` | Identity of one observed content version | `rss_records.hash` |
| `SourceRecord` | Persisted source content version/history record | `rss_records` |
| `ExtractionAttempt` | One versioned AI structured-output attempt with usage/error | JSON sidecar today |
| `VacancyListing` | Current normalized listing on one source | `vacancies` |
| `VacancyCluster` | Group of listings believed to represent one opportunity | `unique_vacancies` |
| `CanonicalListing` | Listing chosen as the cluster representative | `canonical_vacancy_id` |
| `TaxonomyNode` | Normalized ROLE, SKILL, or DOMAIN | `nodes` |
| `ReadyListing` | Listing safe for feed consumers after core processing | implicit after upsert |
| `CorpusStats` | Derived IDF/co-occurrence data | materialized views |
| `QuarantinedRecord` | Permanently failed data requiring correction/reprocess | no explicit model |

Never use unqualified `dedup` in new code or docs:

- exact seen-version handling is **source-record suppression**;
- semantic entity grouping is **listing clustering**.

## Target bounded contexts

- **Acquisition:** sources, connectors, snapshots, fingerprints, records, source-run audit; knows no
  companies, taxonomy, embeddings, feed, or Telegram.
- **Listing processing:** extraction, eligibility, company/taxonomy resolution, current listing;
  consumes record IDs and never fetches feeds.
- **Post-processing:** embeddings, clusters/aggregates, corpus stats; consumes ready listings and is
  eventually consistent.
- **Discovery/notification:** read published data; never control ingest success.

## Target workflow graph

```text
ingestCycleWorkflow(cycleInput)
  ├─ listSources
  ├─ sourceIngestWorkflow(sourceId, cycleId) × N
  │    ├─ captureSnapshot
  │    ├─ saveSourceRecords
  │    └─ start processRecordWorkflow(recordId, pipelineVersion) × M
  └─ return acquisition summary by source

processRecordWorkflow(recordId, pipelineVersion)
  ├─ extractRecord
  └─ upsertListing

postProcessWorkflow(trigger)
  ├─ embedListings ────────────┐
  ├─ refreshCorpusStats ───────┤ bounded parallel branches
  └─ clusterListings ←─────────┘ cluster only after embeddings

notifySubscribersWorkflow()
  └─ independent downstream consumer with freshness buffer
```

### Main-ingest boundary

Core ingest includes acquisition plus listing processing, but they are separate workflow lifecycles.
`SourceIngestRun` completes after its snapshot and source records are durable and all corresponding
record workflows are durably started. It does not claim that every listing is ready.

`processRecordWorkflow` completes only when the record was either:

- successfully extracted and upserted as a listing;
- deliberately skipped as an expected outcome such as `isTech=false`; or
- failed visibly in Temporal after retry policy exhaustion/non-retryable failure.

### Post-process boundary

Embeddings, clustering, corpus statistics, recommendations, and notifications are eventual. They
must not roll back or fail a valid source record/listing write. Feed may show a listing before it is
clustered. If product requirements later require zero visible duplicates, add an explicit publish
gate rather than silently redefining ingest completion.

## Target names and contracts

| Current | Target | Outcome |
|---|---|---|
| `rssIngestAllWorkflow` | `ingestCycleWorkflow` | acquisition summary for selected sources |
| `rssIngestWorkflow` | `sourceIngestWorkflow` | durable snapshot/records and started record work |
| `vacancyPipelineWorkflow` | `processRecordWorkflow` | skipped, ready listing, or visible failure |
| `dedupSweepWorkflow` | `postProcessWorkflow` | derived-data summary |
| `listRemoteSources` | `listSources` | active source references |
| `fetchAndStore` | `captureSnapshot` | stored snapshot reference and run ID |
| `parseAndDedup` | `saveSourceRecords` | inserted record IDs plus counts |
| `extractAndInsert` | `extractRecord` | versioned extraction outcome |
| `loadVacancy` | `upsertListing` | listing ID or expected skip |
| `dedupSweep` | split activities | no hidden embed-plus-cluster sequence |
| `refreshNodeStats` | `refreshCorpusStats` | refreshed derived views |
| `finalizeIngest*` | remove or `recordRunSummary` | audit projection, not failure control |

Use object contracts, not positional primitives. `CaptureSnapshotResult` carries `ingestRunId`,
`sourceId`, `storageKey`, and `capturedAt`; `SaveSourceRecordsResult` carries `seen`, `rejected`,
`alreadyKnown`, and inserted IDs; `ProcessRecordInput` carries `recordId` plus `pipelineVersion`;
its result is `{status:"ready", listingId}` or `{status:"skipped", reason:"non-tech"}`.

Do not return raw XML through workflow history. If source feeds become large enough that record ID
arrays threaten history size, introduce paged/batch child workflows; do not pass content payloads.

## Concurrency model

- Sources `3`; record starts `25` per source; LLM worker `10` initially, all config-backed.
- Listing writes are DB-pool-aware; do not parallelize queries inside one transaction.
- Embeddings use bounded provider-sized batches (current `100` is a starting point).
- Clustering and corpus refresh each allow one active writer; refresh may parallelize with embedding.
- Telegram retains independent rate limiting and per-subscription isolation.

All limits must be configuration with validated defaults in
`apps/etl/src/platform/config/env.validation.ts`; no magic fan-out constants in workflow bodies.

## Temporal failure model

### Rule

Temporal owns execution history, retry state, and workflow visibility. Postgres owns domain data and
audit projections. A database `status` must not pretend to be the authoritative Temporal status.

### Errors versus outcomes

- `isTech=false`, no new records, and no active sources are successful expected outcomes.
- malformed credentials/configuration and unsupported source adapters are non-retryable failures.
- network timeout, 429, 5xx, DB deadlock, and temporary storage failure are retryable.
- malformed individual items are rejected/countable data outcomes unless the whole snapshot is
  structurally unusable.
- an exhausted record failure remains a failed `processRecordWorkflow`, not a swallowed warning.

### Allowed `try/catch`

Keep a catch only for compensation, explicit failure classification, quarantine persistence, or an
intentional partial-success boundary. Remove catches that merely log/swallow or maintain a second
execution state. `Promise.allSettled` is appropriate at source/record isolation boundaries when its
result is returned as an explicit summary.

The current top-level catch cannot be deleted before DB status semantics change: otherwise failed
rows remain `running`. Transition monitoring first, then remove it.

### Initial retry policy matrix

| Activity | Retryable | Non-retryable/expected |
|---|---|---|
| `listSources` | transient DB | invalid query/config deployment bug |
| `captureSnapshot` | timeout, DNS blip, 429, 5xx, S3/DB transient | 401/403/404, missing connector |
| `saveSourceRecords` | DB/storage transient | unusable snapshot contract |
| `extractRecord` | 429, timeout, provider 5xx, limited schema retries | auth/model config error |
| `upsertListing` | DB connection/deadlock | invalid extraction contract |
| `embedListings` | 429, timeout, provider 5xx | vector/model contract violation |
| `clusterListings` | DB transient | broken grouping invariant |
| `refreshCorpusStats` | DB lock/transient | missing view/migration |

Prefer `scheduleToCloseTimeout` as the total retry budget and `startToCloseTimeout` per attempt.
Long batch activities must heartbeat or be split into bounded batches. Do not add hidden retry loops
inside activities; they hide attempts from Temporal visibility.

## Idempotency invariants

- One workflow run creates/reuses one source-run row by `workflow_run_id` or an explicit run key.
- Snapshot writes use a deterministic storage key and may overwrite identical content safely.
- Source-record uniqueness is `(source_id, content_fingerprint)`.
- Listing identity is `(source_id, external_id)`.
- Listing conflict update is latest-wins; an older record cannot replace `last_rss_record_id`.
- Taxonomy/company resolve-or-create remains race-safe inside the listing transaction.
- Extraction attempt identity includes `(record_id, pipeline_version, activity_attempt)`.
- Embedding reuse requires both current model and current embedding-source hash.
- Listing-content change invalidates embedding and cluster state atomically or marks it dirty.
- Cluster assignment is serialized and safe to replay.
- Materialized-view refresh is safe to repeat.
- Notification delivery retains its existing sent-notification idempotency key.

## Database plan

### No large rewrite

Keep `sources`, `rss_ingests`, `rss_records`, `vacancies`, `unique_vacancies`, companies, taxonomy,
and derived views. Physical generic renames are optional after service extraction and should not be
mixed into the workflow correctness PRs.

### Migration A — recommended extraction-attempt table

Add `libs/database/src/schema/record-extractions.ts` and export it from
`libs/database/src/schema/index.ts`. Suggested columns:

```text
id uuid primary key
rss_record_id uuid not null references rss_records(id) on delete cascade
pipeline_version integer not null
prompt_version integer not null
attempt integer not null
status text/enum: running | succeeded | failed
data jsonb null
usage jsonb null
error_type text null
error_message text null
started_at timestamptz not null
finished_at timestamptz null
unique (rss_record_id, pipeline_version, attempt)
index (rss_record_id, status, finished_at desc)
```

The listing processor selects the latest successful extraction for its requested pipeline version.
Keep `rss_records.extracted_data` temporarily for backward compatibility, backfill the new table,
switch readers/cost view, then stop writing the old JSON. Drop old columns only in a later migration
after monitoring and lineage consumers are migrated.

### Migration B — optional explicit readiness

Only add `vacancies.ready_at`/`processing_status` if feed/notification require a hard publish gate.
Today a transactional `upsertListing` is already an adequate ready boundary, so this migration is
deferred until a product requirement needs it.

### Migration C — optional ingest-cycle projection

Only add `ingest_cycles` and `rss_ingests.cycle_id` if product/operator analytics need a persisted
cross-source cycle entity. Temporal already supplies the execution entity; do not duplicate it only
for aesthetics.

### Required update-path behavior

When a newer source record changes embedding-relevant listing content:

1. lock/read the existing listing and its old cluster ID;
2. reject/no-op if the incoming record is older than the current record;
3. upsert source and normalized fields plus skills;
4. clear `embedding`, `embedding_model`, `embedding_source_hash`;
5. clear `unique_vacancy_id` and `dedup_reason`, or mark the listing dirty;
6. recompute/mark dirty the old cluster aggregates;
7. commit as one transaction;
8. let post-processing re-embed and re-cluster.

Define the ordering key explicitly. Prefer `rss_records.created_at`/ingest observation order for
latest-wins, with `published_at` as source metadata rather than processing order.

## Target file layout

Top-level orchestration goes in `apps/etl/src/workflows/`: the four target `*.workflow.ts` files,
`notify-subscribers.workflow.ts`, `contracts.ts`, `concurrency.ts`, and `index.ts`.

Activities stay with their contexts: acquisition activities under `01-ingest`, `extract-record` under
`02-enrich/extraction`, `upsert-listing` under `02-enrich/loader`, and embedding/clustering/stats under
`02-enrich/dedup`. Domain services/repositories remain where they are. Do not move every service in
the naming PR; move workflows first and reorganize only in separate reviewable changes.

## Subtasks

### T0 — characterization and safety net

- [x] Add workflow characterization tests under `01-ingest/rss/workflows/*.spec.ts` for empty source
  set, multi-source success, one-source failure, record partial failure, and deterministic IDs.
- [x] Preserve focused activity tests currently under `apps/etl/src/01-ingest/rss/activities/`.
- [x] Add unit fingerprint and integration latest-wins listing regression coverage.
- [x] Add a regression test proving content change invalidates embedding/cluster state.
- [ ] Record baseline counts: source runs, new records, extraction failures, listing writes, unresolved
  listings, cluster backlog, and normal cycle duration.
- [ ] Decide and document `PIPELINE_VERSION` semantics for deterministic reprocessing.

*Done when:* tests describe current/target invariants and fail against each confirmed correctness bug.

### T1 — launch-critical correctness fixes

- [x] Filter existing record hashes by source in
  `apps/etl/src/01-ingest/rss/activities/rss-parse.activity.ts`.
- [x] Replace implicit fetch fixture fallback in
  `apps/etl/src/01-ingest/rss/activities/rss-fetch.activity.ts` with explicit dev/test configuration.
- [x] Classify HTTP permanent/transient failures; let retryable failures reach Temporal.
- [x] Make `DrizzleVacancyRepository.upsertWithSkills` latest-wins.
- [x] Invalidate embedding and cluster state on relevant listing changes.
- [x] Repair/dirty the previous cluster after unlinking an updated listing.
- [x] Bound extraction scheduling using a deterministic workflow-compatible helper.
- [x] Add a validated worker concurrency env field in `platform/config/env.validation.ts`.

*Done when:* stale fixtures cannot masquerade as production ingest, two sources preserve identical
records, older backfills cannot overwrite newer listings, and updated listings are reprocessed.

### T2 — workflow vocabulary and contracts

- [ ] Add `apps/etl/src/workflows/contracts.ts` with object inputs/results and stable error types.
- [ ] Add a pure bounded-concurrency helper in `apps/etl/src/workflows/concurrency.ts` with tests.
- [ ] Move/re-export top-level workflows into the target workflow directory.
- [ ] Rename workflow/activity methods according to the target-name table.
- [ ] Update `platform/temporal/temporal.module.ts` activity registration.
- [ ] Update schedulers, controllers, tests, scripts, runbooks, and monitoring labels.
- [ ] Keep compatibility exports/aliases for any in-flight workflow types during safe deployment.

*Done when:* `apps/etl/src/workflows/` alone shows the orchestration graph and no new activity uses
an `And` name.

### T3 — acquisition workflows

- [ ] Implement `ingestCycleWorkflow` with bounded source fan-out and explicit source summaries.
- [ ] Implement `sourceIngestWorkflow` as `captureSnapshot → saveSourceRecords → start records`.
- [ ] Await source child results in the cycle; isolate failures with an explicit aggregate result.
- [ ] Use `ABANDON` only for record workflows whose independent lifecycle is intentional.
- [ ] Ensure the parent awaits each child-start event before returning.
- [ ] Remove corpus refresh from the acquisition workflow.
- [ ] Make `SourceIngestRun` DB fields/counters describe acquisition only.

*Done when:* cycle completion means all source acquisitions ended, while record processing remains
independently visible and durable.

### T4 — per-record listing workflow

- [ ] Implement `processRecordWorkflow(recordId, pipelineVersion)`.
- [ ] Run `extractRecord` then `upsertListing` sequentially.
- [ ] Return typed `ready`/`skipped` outcomes; never throw for `isTech=false`.
- [ ] Use versioned deterministic workflow IDs such as
  `record-processing-<recordId>-v<pipelineVersion>`.
- [ ] Route extraction and listing writes through separate task queues/worker limits.
- [ ] Replace the one-activity `vacancyPipelineWorkflow` after compatibility rollout.

*Done when:* each record has an independent visible lifecycle and a retry cannot duplicate a listing
or overwrite a newer source version.

### T5 — extraction persistence and status authority

- [ ] Add `record_extractions` schema/migration and repository.
- [ ] Persist usage/error per attempt without overwriting earlier attempts.
- [ ] Switch `upsertListing` to the requested latest successful extraction.
- [ ] Migrate `extraction_cost` view and monitoring endpoints.
- [ ] Backfill existing `rss_records.extracted_data` into attempt rows.
- [ ] Treat Temporal as authoritative execution status in monitoring.
- [ ] Remove broad workflow finalization catch only after failed DB rows cannot remain misleading.
- [ ] Deprecate, then stop writing, `rss_records.extracted_data/extracted_at`.

*Done when:* source records are immutable source history, extraction attempts are independently
auditable, and workflow failure does not require a duplicated Postgres state machine.

### T6 — post-processing workflow

- [ ] Split `DedupSweepActivity` into embedding and clustering activities.
- [ ] Run embeddings and corpus-stat refresh in parallel bounded branches.
- [ ] Run clustering only after embeddings complete.
- [ ] Keep cluster assignment single-writer and chronological.
- [ ] Add activity heartbeat/batch checkpoint for long corpus work.
- [ ] Fix changed-hash selection so current-model embeddings are still regenerated after content
  change, or rely on guaranteed null invalidation with a defensive hash check.
- [ ] Return counts/backlog/duration for monitoring.

*Done when:* the Temporal UI exposes embedding, clustering, and stats as separate observable steps and
retrying one does not redo unrelated successful external work.

### T7 — Temporal-native recovery and backfill

- [ ] Replace `/rss/extract-missing` in-process loop with versioned record-processing workflow starts.
- [ ] Replace loader backfill loops with the same `processRecordWorkflow` entry point.
- [ ] Support bounded batch inputs and progress summaries.
- [ ] Define reprocess behavior for completed workflows through a new pipeline version, not ad-hoc
  reuse-policy changes.
- [ ] Retire direct activity injection from backfill services.

*Done when:* normal processing and recovery use identical code, retry policy, idempotency, and
visibility.

### T8 — observability and operations

- [ ] Add Temporal search attributes/memo for source code, ingest run ID, record ID, pipeline version,
  and listing ID where safe.
- [ ] Update `admin/monitoring` to distinguish acquisition, processing, quarantine, and post-process.
- [ ] Add metrics/alerts for source failures, extraction failure ratio, record backlog, embedding
  backlog, unresolved listings, cluster duration, and schedule overlap.
- [ ] Update `md/runbook/failure-recovery.md` for the new workflows and retry matrix.
- [ ] Update `md/architecture/overview.md` only when the new shape ships.

*Done when:* an operator can locate and replay the failed unit without SQL archaeology or broad
all-source reruns.

### T9 — separate-worker/service readiness

- [ ] Introduce task queues: `ingest`, `enrichment`, `listing-write`, `post-processing`,
  `notifications` (names configurable per environment).
- [ ] Split worker registration/config without requiring separate deploys initially.
- [ ] Ensure workflow/activity contracts import no Nest runtime or database implementation types.
- [ ] Keep domain services behind ports/repositories; activities are thin adapters.
- [ ] Deploy separate workers only after metrics show scaling or failure-isolation need.
- [ ] Evaluate Temporal Nexus or cross-service workflow start only when namespace/service ownership
  actually separates.

*Done when:* workers can be deployed/scaled independently without changing data contracts or
workflow definitions.

### T10 — cleanup and close

- [ ] Remove compatibility workflow/activity aliases after in-flight executions drain.
- [ ] Remove obsolete backfill/finalize code and stale tests.
- [ ] Update architecture, runbook, roadmap/release journal, and this tracker outcome.
- [ ] Move this tracker to `md/journal/migrations/_done/ingest-pipeline-refactor.md`.

*Done when:* no legacy execution path remains and documentation describes shipped behavior only.

## Recommended PR sequence

1. **PR 1 — correctness only:** T0 + T1; no naming/moving files.
2. **PR 2 — contracts and readable workflows:** T2 + T3 with compatibility exports.
3. **PR 3 — record processing:** T4; keep old extraction storage temporarily.
4. **PR 4 — extraction attempts:** T5 migration/backfill/read switch.
5. **PR 5 — post-processing:** T6.
6. **PR 6 — recovery/observability:** T7 + T8.
7. **PR 7 — optional worker split:** T9 only when justified.
8. **PR 8 — cleanup:** T10 after old workflow histories are safe.

Never combine physical DB renames, workflow type renames, semantic behavior changes, and extraction
storage migration in one PR.

## Verification matrix

- Unit: fingerprint, errors, concurrency, latest-wins, invalidation, typed outcomes.
- Workflow: replay, child start, retries, isolation, compatibility names.
- Integration: transaction races, uniqueness, attempt selection, cluster repair, idempotent retries.
- Smoke: explicit dev fixture and staging remote path through S3 → record → listing → cluster → feed.
- Operational/load: worker death after side effect and 50–100 items/source under configured limits.

Commands should use existing package scripts from root `package.json`/`apps/etl/package.json`; add a
dedicated workflow integration script only if the existing Jest split cannot run Temporal tests
reliably.

## Rollout and rollback

- Deploy compatibility exports before schedule cutover; pause schedules if old/new can overlap.
- Dual-write old/new extraction storage, backfill bounded/versioned, then switch readers and writes.
- Roll back code without reverting additive schema; drop nothing until histories/readers are safe.
- Keep schedule `SKIP`, but use task-queue concurrency for descendants.

## Risks and mitigations

- **Workflow replay incompatibility:** additive workflow names/compat exports first; use Temporal
  patching/versioning if modifying in-flight definitions.
- **Event-history growth:** bounded child count; batch/page when feeds grow; never pass raw payloads.
- **Repeated LLM cost:** attempt persistence, activity boundaries, bounded retries, stable versions.
- **Cluster corruption on update:** transactional invalidation plus serialized re-clustering tests.
- **Dual status drift:** make authority explicit before deleting finalization projection.
- **Over-engineering before launch:** stop after T1 if correctness is adequate and product feedback is
  the higher-value constraint.
- **Large review diff:** preserve domain services; separate naming/moving from DB behavior changes.

## Launch and portfolio priority

### Must do before inviting users

- C1 source-scoped fingerprint fix.
- C2 production fixture fallback removal.
- C6/C7 updated-listing invalidation and latest-wins protection.
- Bounded extraction concurrency if real BAML extraction is enabled.
- Minimal alerts/monitoring confirming source acquisition and extraction health.

These are data-correctness/cost risks and have higher priority than structural cleanup.

### Can ship after first users

- Full workflow rename/reorganization.
- Dedicated extraction-attempt table, unless failed-attempt cost accuracy is already operationally
  important.
- Separate task queues/deployments.
- Generic connector abstraction.
- Airflow/dbt/data-lineage tooling.

### Portfolio value

The strongest employer-facing story is not "I rewrote folders". It is a short design document plus
two or three small PRs that demonstrate:

- identifying real distributed-systems correctness bugs;
- explicit idempotency and failure boundaries;
- characterization tests before refactor;
- safe Temporal workflow versioning/rollout;
- a justified decision not to add Airflow/Kafka prematurely;
- metrics showing behavior before/after.

Do not delay user validation for the entire tracker. Ship T0/T1, expose the product, then execute the
remaining PRs against observed failure/cost/latency data.

## Open questions

- Which observation order decides latest-wins, and what concurrency matches provider/DB limits?
- Should extraction dual-write first; does feed need `ready_at` beyond a successful transaction?
- What notification clustering delay and deployed Temporal search attributes are appropriate?
- After service split, does ingest retain schema ownership or publish contracts to another service?

Resolve the first four before T3/T5 implementation. Others can remain evidence-driven.

## Links

- Architecture snapshot: [`../../architecture/overview.md`](../../architecture/overview.md)
- Existing RSS follow-ups: [`rss-schedule-followups.md`](./rss-schedule-followups.md)
- Initial Temporal migration: [`_done/rss-temporal.md`](./_done/rss-temporal.md)
- Initial loader pipeline: [`_done/loader-pipeline.md`](./_done/loader-pipeline.md)
- Semantic clustering: [`semantic-dedup.md`](./semantic-dedup.md)
- Failure recovery runbook: [`../../runbook/failure-recovery.md`](../../runbook/failure-recovery.md)
- Extraction cost runbook: [`../../runbook/extraction-cost.md`](../../runbook/extraction-cost.md)
- Temporal orchestration ADR: [`../decisions/0003-temporal-orchestration.md`](../decisions/0003-temporal-orchestration.md)
- BAML extraction ADR: [`../decisions/0004-baml-vacancy-extraction.md`](../decisions/0004-baml-vacancy-extraction.md)
- PR: —
