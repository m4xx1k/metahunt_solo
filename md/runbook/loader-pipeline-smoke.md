# Loader pipeline — local E2E smoke

**Use when:** verifying the silver-layer loader (`vacancyPipelineWorkflow`) locally — after schema changes, after a refactor of the resolvers, or before opening a PR that touches `apps/etl/src/loader/`.

The loader stage runs per-record after extraction: `rssIngestWorkflow` fans out one `vacancyPipelineWorkflow` child per successfully extracted record (`ABANDON` parent close, deterministic `workflowId = vacancy-pipeline-{rssRecordId}`). Each child runs `loadVacancy(rssRecordId)`, which calls `VacancyLoaderService.loadFromRecord` — `CompanyResolver` + `NodeResolver` (race-safe via `ON CONFLICT DO NOTHING`), then a transactional vacancy upsert + `vacancy_nodes` rewrite.

There are two ways to smoke this locally: a fast **programmatic** path that exercises the loader against a fresh DB (no Temporal), and a **full HTTP** path that drives `rssIngestWorkflow` through Temporal.

## Fast path — programmatic smoke

Self-contained: spins up an isolated `metahunt_loader_smoke` database, applies every migration, seeds two `rss_records` with realistic `extractedData` payloads, runs the loader, asserts the silver-layer rows, then drops the DB.

```bash
pnpm db:up   # if not already running — needs metahunt-db at :54322
npx ts-node --project apps/etl/tsconfig.json apps/etl/scripts/loader-smoke.ts
```

Expected output (counts after smoke):

```
Loader smoke against postgres://metahunt:metahunt@localhost:54322/metahunt_loader_smoke
DB created
Migrations — done
Migrations applied
Seeded 2 rss_records
Loaded vacancyA=<uuid> vacancyB=<uuid>
Smoke OK — vacancies=2 companies=1 nodes=8 (ROLE=2 SKILL=5 DOMAIN=1) aliases=8 required-skills=4 optional-skills=1
Smoke DB dropped — done
```

Both records share `companyName: "Acme Corp"` so the `CompanyResolver` collapses them onto one company. The five distinct skills (Go, PostgreSQL, Docker, TypeScript, React) become five `nodes` rows, each with one alias and `status='NEW'`. Re-running the loader on the same record is a no-op (idempotent); the script asserts this.

The script is the source of truth for the expected shape — when adding new fields to the loader, extend the assertions here.

## Full path — HTTP + Temporal

Exercises the real `rssIngestWorkflow` → `vacancyPipelineWorkflow` chain. Use this when you've changed the workflows themselves (e.g. fan-out semantics, child policy, workflow bundling).

Prereqs: full local stack up, ETL booted with the worker.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed                         # populates `sources` (Djinni, DOU)
EXTRACTOR_PROVIDER=placeholder pnpm dev:etl    # starts Nest + Temporal worker
```

In a second terminal:

```bash
curl -s -X POST http://localhost:3000/rss
# {"triggered":"all"}
```

Wait ~10–30s, then verify in Postgres:

```sql
-- Bronze + extraction
SELECT count(*) FROM rss_records WHERE extracted_at IS NOT NULL;

-- Silver (should grow as the pipeline workflows complete)
SELECT count(*) FROM vacancies;

-- Each vacancy traces back to its source record
SELECT v.id, v.title, v.external_id, v.source_id, v.last_rss_record_id
  FROM vacancies v
  ORDER BY v.loaded_at DESC LIMIT 10;

-- Moderation queue: every newly seen role/skill/domain
SELECT type, count(*) FROM nodes WHERE status='NEW' GROUP BY type;
```

Cross-check Temporal UI (http://localhost:8080):

- `rssIngestWorkflow` runs → status `Completed`. The "History" tab shows `StartChildWorkflowExecutionInitiated` events for `vacancyPipelineWorkflow`.
- `vacancyPipelineWorkflow` runs → one per `rssRecordId`, `workflowId = vacancy-pipeline-<rssRecordId>`, status `Completed`.

If a child failed, the parent ingest still finalizes as `completed` (children run with `parentClosePolicy: ABANDON`). Use the `/loader/backfill` endpoint to retry stuck records:

```bash
curl -s -X POST 'http://localhost:3000/loader/backfill?limit=100'
# {"attempted":N,"succeeded":N,"failed":0}
```

The endpoint runs the loader in-process (no Temporal) for `rss_records WHERE extracted_at IS NOT NULL AND NOT EXISTS (matching vacancies row)`, ordered by `created_at ASC`. Synchronous; cap via `?limit=` (default 100, max 500).

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm db:migrate` errors `relation "sources" already exists` | DB has tables but `__drizzle_migrations` is empty (schema was pushed out-of-band) | Drop & recreate the local DB, or use the smoke script which works against a fresh DB. |
| Smoke script: `Cannot derive external_id` | Source code in `EXTRACTORS` registry doesn't match `sources.code` | Check `apps/etl/src/loader/external-id/source-external-id.ts` |
| HTTP smoke: `vacancies` stays at 0 after triggering `/rss` | Worker isn't picking up `vacancyPipelineWorkflow` | Confirm `LoaderModule` is in `AppModule` imports and `LOADER_ACTIVITIES` is in the worker's `activityClasses` (`apps/etl/src/temporal/temporal.module.ts`) |
| HTTP smoke: child workflow fails with `WorkflowExecutionAlreadyStarted` | Re-run hit the deterministic ID guard | Either drop the failed `vacancies`/`rss_records` row or rely on `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` (already configured) on the next ingest pass |
