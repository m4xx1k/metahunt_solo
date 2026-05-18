# Architecture overview

> Snapshot — describes the state **right now**. If something drifts from the code, update this file.

## Big picture

metahunt — job aggregator for the Ukrainian IT market. Current baseline is a running HTTP ETL shell with a real Postgres/Drizzle connection and migration/seed workflow.

## Monorepo

pnpm workspaces. Root — `/home/user/plan-a/metahunt/`. Workspaces declared in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "libs/*"
```

Each package has its own `package.json` and its own dependencies. Local deps are wired via `workspace:*`.

| Package | Type | Path | Purpose |
|---|---|---|---|
| `@metahunt/etl` | app | `apps/etl/` | NestJS HTTP app, process entry point. Deployed to Railway. |
| `@metahunt/web` | app | `apps/web/` | Next.js 16 frontend (landing, future app shell). Deployed to Vercel. |
| `@metahunt/database` | lib | `libs/database/` | Shared Drizzle/Postgres module and schema |

Why pnpm workspaces and not the Nest CLI monorepo — see ADR-0001. Why frontend lives here too — see ADR-0005.

## Build model

- `libs/database` is compiled with `tsc` into its own `dist/`. The `main` field in the lib's `package.json` points to `dist/index.js`. Consumers therefore resolve compiled code, not sources.
- `apps/etl` is built with `nest build` (which calls `tsc` under the hood via nest-cli). The `@metahunt/database` import is resolved through a symlink at `apps/etl/node_modules/@metahunt/database`.
- Topological order: lib first, then app. The root `pnpm build` script does this sequentially via `pnpm --filter`.

## NestJS layout

`apps/etl` currently contains:

- `AppModule` — imports `ConfigModule` (global, with env validation), `DatabaseModule` (global), `StorageModule`, `TemporalInfraModule`, `RssModule`, `LoaderModule`, `VacanciesModule`, `TaxonomyModule`, `MonitoringModule`, `ExtractionCostModule`, `UsersModule`. Registers `AppController` + `HealthController`. CORS enabled globally with `origin: "*"` (set in `main.ts`) so the web app can read `/monitoring`, `/vacancies` and `/extraction-cost` cross-origin, and write to `/users/subscribe`.
- `AppController` — `GET /`: runs `SELECT 1`, returns `{ status: "ok", db: "up" }` (legacy canary; Railway healthcheck is `/healthz`).
- `HealthController` — `GET /healthz`: aggregated Postgres + S3 + Temporal check via `Promise.all` with per-call latency capture. 200 if all three are ok; 503 with per-dependency error detail otherwise.
- `RssModule` — full RSS ingest pipeline. Imports `StorageModule` + `ExtractionModule` + `TemporalModule.registerAsync({ isGlobal: true, ... })`. Providers: `RssParserService`, four activities (`RssFetch/Parse/Extract/Finalize`), `RssSchedulerService`. Controller: `RssController`.
- `RssController` — `GET /rss`: 202 + `{ triggered: "all" }`, fire-and-forget `scheduler.ingestAll()`. `POST /rss/extract-missing?limit=N`: synchronous backfill that runs `extractAndInsert` for `rss_records WHERE extracted_at IS NULL` (default 100, max 500). Returns `{ attempted, succeeded, failed }`. Used to recover records inserted by parse but skipped by extraction in a prior failed run.
- `LoaderModule` — silver-layer per-vacancy pipeline. Providers: `CompanyResolverService` (per-source identifier with slug fallback), `NodeResolverService` (race-safe alias-keyed `nodes` lookup, `status='NEW'` until moderated), `VacancyLoaderService` (transactional vacancy upsert + `vacancy_nodes` rewrite from an extracted record), `LoaderBackfillService`, `LoadVacancyActivity`. Controller: `LoaderController`.
- `LoaderController` — `POST /loader/backfill?limit=N`: synchronous in-process backfill that runs `VacancyLoaderService.loadFromRecord` for `rss_records WHERE extracted_at IS NOT NULL AND NOT EXISTS (matching vacancies row)` (default 100, max 500). Used to recover records that extracted but whose `vacancyPipelineWorkflow` failed.
- `VacanciesModule` — public read API over the silver feed. `VacanciesController` exposes `GET /vacancies` (list + filter, pagination via `page`/`pageSize`, query via `q`, plus `includeRoleless` / `includeAllSkills` flags). `VacanciesService` runs a Drizzle list query joining `sources`, `companies`, role/domain `nodes`, `rss_records` (link, publishedAt) and a second batched skills query keyed by vacancy id. Default behaviour surfaces only `nodes.status='VERIFIED'` for role/domain/skills and hides vacancies without a verified role; flags lift those gates. Wire contract: `vacancies.contract.ts` (DTO + query types). No auth — public read.
- `TaxonomyModule` — read-only moderation API at `/admin/taxonomy/*` (`coverage`, `queue?type=…`, `nodes/:id`, `nodes/:id/fuzzy-matches`). `TaxonomyService` aggregates verified-vs-new-vs-missing per axis, ranks NEW nodes by `vacancies_blocked`, and computes trigram suggestions (per-type threshold matrix; SKILL adds `word_similarity` for token-boundary respect). No auth — gate before exposing beyond localhost.
- Workflows (loader): `apps/etl/src/loader/workflows/vacancy-pipeline.workflow.ts` — `vacancyPipelineWorkflow(rssRecordId)` runs `loadVacancy` today; future stages (dedup, telegram) append here without rewrite. Started as an `ABANDON` child of `rssIngestWorkflow` per successfully extracted record, with deterministic `workflowId = vacancy-pipeline-<rssRecordId>` and `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` so a failed pipeline retries on the next ingest pass without blocking the happy path.
- Workflows barrel: `apps/etl/src/workflows/index.ts` aggregates `rss/workflows` + `loader/workflows` so the Temporal worker bundles every feature's workflows from one `workflowsPath`.
- `MonitoringModule` — read-only observability over the ETL pipeline. `MonitoringController` exposes six endpoints under `/monitoring`: `stats` (totals + last-24h + per-source latest run), `sources`, `ingests` + `ingests/:id`, `records` + `records/:id`, all with offset/limit pagination and inline query parsing (`query-parsing.ts`, mirrors the `/rss` style). `MonitoringService` does the joins/aggregations directly via the global Drizzle instance (counts of records-per-ingest and extracted-per-ingest computed in SQL, not N+1). `listRecords` and `getRecord` return identical shapes — both include `description` and `extractedData` — so the web feed renders `RssRecordCard` without an extra detail fetch. No auth; intended for operator/dev consumption only.
- `RssSchedulerService` — two methods, no boolean: `ingestRemote()` (sources with `rssUrl IS NOT NULL`) and `ingestAll()` (every source; the HTTP-trigger use-case). Both call `temporal.startWorkflow("rssIngestWorkflow", [source.id], ...)` per source. Implements `OnApplicationBootstrap` and (re)installs a Temporal Schedule `rss-ingest-hourly` on every boot — calendar spec `{ minute: 0, hour: { start: 6, end: 22, step: RSS_INGEST_INTERVAL_HOURS } }`, timezone `Europe/Kyiv`, overlap policy `SKIP`, action starts `rssIngestAllWorkflow`. If the schedule already exists, the service updates its spec/action via the schedule handle so env-driven cadence changes apply on restart.
- Workflows: `apps/etl/src/rss/workflows/{rss-ingest.workflow.ts, rss-ingest-all.workflow.ts, index.ts}` — barrel pattern so the Temporal worker bundler can resolve the workflowsPath directory. `rssIngestAllWorkflow` (driven by the Temporal Schedule) calls `listRemoteSourceIds` then fans out one `rssIngestWorkflow` child per source with `parentClosePolicy: ABANDON` so children survive the parent finishing.
- Activities chain: `listRemoteSourceIds` (used by `rssIngestAllWorkflow`) → `fetchAndStore` (fetch RSS XML or read fixture fallback, write `rss_ingests` row, upload XML to S3) → `parseAndDedup` (download XML, parse, hash, derive `external_id` per-source via the loader's extractor registry — items whose extractor throws are dropped, not bronzed — dedup against existing `rss_records` by hash, insert new ones) → `extractRecord` (read each new record, delegate to `VacancyExtractor`, write `extracted_data` + `extracted_at`) → `finalizeIngest` (set `rss_ingests.status = completed | failed` + `finishedAt`). `rssIngestWorkflow` then fans out one `vacancyPipelineWorkflow` child per successfully extracted record (`ABANDON`, deterministic id) so the per-vacancy loader runs out-of-band.
- `ExtractionModule` — provides the `VACANCY_EXTRACTOR` token. Factory switches on `EXTRACTOR_PROVIDER ∈ {baml, placeholder}`: `BamlVacancyExtractor` (BAML-typed client over OpenAI; `apps/etl/baml_src/extract-vacancy.baml` is the single source of truth for schema + prompt + per-field instructions; generated TS lives in `apps/etl/src/baml_client/`; → ADR-0004) or `PlaceholderVacancyExtractor` (static shape, default). The activity depends only on the token; the extractor returns `{ data: ExtractedVacancy | null, meta: { promptVersion, usage, error? } }` — failures resolve with `data = null` rather than throwing, so the activity can persist the failed attempt's token usage before re-throwing for Temporal retry. `BamlVacancyExtractor` injects DRIZZLE to fetch VERIFIED ROLE + DOMAIN canonical names (cached 60s) and passes them to `b.ExtractVacancy(text, knownRoles, knownDomains)` as soft prompt hints. `PROMPT_VERSION` is a manual integer constant bumped per meaningful prompt change. Model pricing lives in `pricing.ts` (`MODEL_PRICING_USD_PER_MTOK`); `_usage.model` is read from `OPENAI_MODEL` env at call time because BAML's `LlmCall.clientName` exposes the BAML client name, not the underlying OpenAI model.
- `ExtractionCostModule` — read-only spend analytics. `ExtractionCostController` exposes `GET /extraction-cost/summary` returning `{ total, last24h, byPromptVersion[], byModel[], recent[] }`. `ExtractionCostService` queries the `extraction_cost` SQL view (migration `0009`) which parses the `_v` / `_usage` sidecar on `rss_records.extracted_data` and computes `cost_usd` via CASE-on-model branches. Web counterpart at `/dashboard/extraction`.
- `UsersModule` — waitlist signup write API. `UsersController` exposes `POST /users/subscribe` with body `{ email, source }`; `UsersService` runs `INSERT ... ON CONFLICT DO NOTHING RETURNING id` against the `users` table (migration `0010`) and returns `{ status: "subscribed" | "already_subscribed" }` so the client never has to handle a 409. Email is lowercased server-side; `source` is validated against `ALLOWED_SIGNUP_SOURCES`. Consumed by `FinalCTAForm` on the landing page + `/welcome`.
- `StorageModule` / `StorageService` — S3-compatible client over `@aws-sdk/client-s3` (`forcePathStyle: true`, so MinIO / Cloudflare R2 / AWS S3 all work via `STORAGE_*` env vars). Methods: `upload`, `download`, `ping` (HeadBucket, used by `/healthz`).
- `main.ts` — loads `.env` via explicit `dotenv` path (resolves to repo `.env` from `dist/main.js`), then `NestFactory.create(AppModule)` + `app.listen(PORT)` (default 3000).
- `baml_src/` (sibling of `src/`) — BAML DSL: `clients.baml`, `generators.baml`, `extract-vacancy.baml`. `pnpm baml:generate` writes the typed TS client to `src/baml_client/` (committed). Consumed only by `BamlVacancyExtractor` in `src/baml-extraction/`.

`libs/database` currently contains:

- `DatabaseModule` — `@Global()`, provides the `DRIZZLE` token (typed Drizzle instance).
- `drizzle.provider.ts` — builds `pg` pool from `DATABASE_URL` and returns `drizzle(pool, { schema })`.
- `schema/*` — tables: `sources`, `rss_ingests`, `rss_records` (bronze); `companies`, `company_identifiers`, `nodes`, `node_aliases`, `vacancies`, `vacancy_nodes` (silver); `users` (waitlist). Enums: `seniority`, `work_format`, `employment_type`, `english_level`, `currency`, `engagement_type`, `node_type`, `node_status`.
- `migrations/*` + `migrations/meta/*` — drizzle SQL + snapshots/journal.
- `seeds/*` — initial reference seed (`sources`: Djinni, DOU).

`@Global()` means `apps/etl` (and any future app) **must not** re-import `DatabaseModule` in submodules — one import in the root module is enough.

## Dependencies

| Package | Runtime deps |
|---|---|
| `@metahunt/database` | `@nestjs/common`, `@nestjs/config`, `drizzle-orm`, `pg` |
| `@metahunt/etl` | `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`, `@metahunt/database`, `drizzle-orm`, `fast-xml-parser`, `zod`, `@aws-sdk/client-s3`, `nestjs-temporal-core`, `@temporalio/{client,worker,workflow,activity}`, `@boundaryml/baml` |

## Runtime and env

- Local DB runs in docker (`pgvector/pgvector:pg16`) on `localhost:54322`.
- `db:migrate` and `db:seed` scripts load env via `dotenv/config`.
- ETL runtime loads root `.env` two redundant ways: `node --env-file-if-exists=../../.env` in the prod start scripts (Node native) AND `dotenv.config({ path: resolve(__dirname, "../../../.env") })` in `main.ts` (works under `nest start --watch` too). Nest's `ConfigModule.forRoot({ ignoreEnvFile: true, validate })` then validates the resulting `process.env`.
- In server environments (Railway), there is no `.env` file — `dotenv` silently no-ops and process-level env from the platform takes over. Same code path.
- Temporal: `TEMPORAL_API_KEY` empty → plaintext to `localhost:7233` (local). `TEMPORAL_API_KEY` set → automatic `tls: true` + API-key auth (Temporal Cloud). All other `TEMPORAL_*` vars are user-supplied per environment.
- RSS schedule: `RSS_INGEST_INTERVAL_HOURS` (default 1, range 1..16) controls how often the daily ingest fires inside the 06:00–22:00 Europe/Kyiv window. The schedule is owned by Temporal Server, not Nest's `@Cron` — installed at app boot, survives restarts, manageable from the Temporal UI.
- LLM extraction off by default (`EXTRACTOR_PROVIDER=placeholder` → `PlaceholderVacancyExtractor`). Set `EXTRACTOR_PROVIDER=baml` + `OPENAI_API_KEY` to enable real extraction.

## Local infra (docker-compose)

`pnpm db:up` brings up the full local stack (`docker compose up -d`):

| Service | Image | Ports | Purpose |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg16` | `54322:5432` | App + Temporal Postgres |
| `minio` | `minio/minio:latest` | `9000` (S3), `9001` (console) | S3-compatible object store for raw RSS payloads |
| `minio-init` | `minio/mc:latest` | — | One-shot: creates `rss-payloads` bucket idempotently, then exits |
| `temporal` | `temporalio/auto-setup:1.26` | `7233` (gRPC) | Temporal server; auto-creates `temporal` + `temporal_visibility` databases inside `db` |
| `temporal-ui` | `temporalio/ui:2.34.0` | `8080` | Workflow UI |

Default credentials live in `.env.example` and match container env (`metahunt`/`metahunt`/`metahunt123` for db/MinIO root creds). Temporal namespace is `default`; task queue is `rss-ingest`.

## Deployment

Two independent surfaces, both built from a subset of this monorepo. Neither rebuilds when only the other's files change.

### `@metahunt/etl` → Railway

- Builder: Dockerfile (multi-stage, Node 22). The runtime image copies **only** `apps/etl/dist/`, `libs/database/dist/`, migrations, and the workspace `node_modules` it needs. `apps/web/` is excluded by both selective `COPY` lines and `.dockerignore`.
- `railway.json` `watchPatterns` lists root infra files + `apps/etl/**` + `libs/**`. Frontend-only commits don't trigger a Railway build.
- Pre-deploy: `node -r ts-node/register/transpile-only libs/database/migrate.ts` runs Drizzle migrations.
- Healthcheck: `GET /healthz` (Postgres + S3 + Temporal aggregated).

### `@metahunt/web` → Vercel

- Builder: Vercel's Next.js preset, `Root Directory = apps/web`, `Install Command = cd ../.. && pnpm install --frozen-lockfile` (so workspace resolution happens at the monorepo root).
- Ignored Build Step: `git diff --quiet HEAD^ HEAD -- . ../../libs ../../package.json ../../pnpm-lock.yaml` — Vercel skips a build when only backend files changed.
- `NEXT_PUBLIC_API_URL` (declared in `apps/web/.env.example`) points at the ETL base URL. Used by Server-Component fetches in `apps/web/lib/api/` — must be set on the Vercel project per environment.
- Setup procedure: [`md/runbook/vercel-deploy.md`](../runbook/vercel-deploy.md).

## Current gaps

- BAML prompt v2 shipped (canonical-taxonomy injection + anti-fluff per-field rules + few-shot examples — see [migration tracker](../journal/migrations/extraction-prompt-v2.md) and [runbook](../runbook/extraction-cost.md)); empirical v1→v2 SKILL-coverage delta was deferred and remains the open question for the next Stage 06 iteration.
- No moderator write-path on `/admin/taxonomy/*` (read-only today). Phase 2 of [`taxonomy-curation`](../journal/migrations/taxonomy-curation.md).
- No auth on `/admin/taxonomy/*` or `/rss` admin endpoints — gate before exposing beyond localhost. See [`rss-schedule-followups.md#a--production-hardening`](../journal/migrations/rss-schedule-followups.md#a--production-hardening) (A1).
- No lint/format pipeline or CI yet (Stage 07).
- LLM extraction defaults to `EXTRACTOR_PROVIDER=placeholder` (static stub, no LLM call). Switching to `EXTRACTOR_PROVIDER=baml` requires a valid `OPENAI_API_KEY` (BAML routes through OpenAI by default).
