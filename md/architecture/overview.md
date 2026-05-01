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
| `@metahunt/etl` | app | `apps/etl/` | NestJS HTTP app, process entry point |
| `@metahunt/database` | lib | `libs/database/` | Shared Drizzle/Postgres module and schema |

Why pnpm workspaces and not the Nest CLI monorepo — see ADR-0001.

## Build model

- `libs/database` is compiled with `tsc` into its own `dist/`. The `main` field in the lib's `package.json` points to `dist/index.js`. Consumers therefore resolve compiled code, not sources.
- `apps/etl` is built with `nest build` (which calls `tsc` under the hood via nest-cli). The `@metahunt/database` import is resolved through a symlink at `apps/etl/node_modules/@metahunt/database`.
- Topological order: lib first, then app. The root `pnpm build` script does this sequentially via `pnpm --filter`.

## NestJS layout

`apps/etl` currently contains:

- `AppModule` — imports `ConfigModule` (global, with env validation), `DatabaseModule` (global), `StorageModule`, `RssModule`. Registers `AppController` + `HealthController`.
- `AppController` — `GET /`: runs `SELECT 1`, returns `{ status: "ok", db: "up" }` (legacy canary; Railway healthcheck is `/healthz`).
- `HealthController` — `GET /healthz`: aggregated Postgres + S3 + Temporal check via `Promise.all` with per-call latency capture. 200 if all three are ok; 503 with per-dependency error detail otherwise.
- `RssModule` — full RSS ingest pipeline. Imports `StorageModule` + `ExtractionModule` + `TemporalModule.registerAsync({ isGlobal: true, ... })`. Providers: `RssParserService`, four activities (`RssFetch/Parse/Extract/Finalize`), `RssSchedulerService`. Controller: `RssController`.
- `RssController` — `GET /rss`: 202 + `{ triggered: "all" }`, fire-and-forget `scheduler.ingestAll()`.
- `RssSchedulerService` — two methods, no boolean: `ingestRemote()` (sources with `rssUrl IS NOT NULL`, the future cron use-case) and `ingestAll()` (every source; the HTTP-trigger use-case). Both call `temporal.startWorkflow("rssIngestWorkflow", [source.id], ...)` per source.
- Workflow: `apps/etl/src/rss/workflows/{rss-ingest.workflow.ts, index.ts}` — barrel pattern so the Temporal worker bundler can resolve the workflowsPath directory.
- Activities chain: `fetchAndStore` (fetch RSS XML or read fixture fallback, write `rss_ingests` row, upload XML to S3) → `parseAndDedup` (download XML, parse, hash, dedup against existing `rss_records` by hash, insert new ones) → `extractRecord` (read each new record, delegate to `VacancyExtractor`, write `extracted_data` + `extracted_at`) → `finalizeIngest` (set `rss_ingests.status = completed | failed` + `finishedAt`).
- `ExtractionModule` — provides the `VACANCY_EXTRACTOR` token. Factory switches on `EXTRACTOR_PROVIDER ∈ {baml, placeholder}`: `BamlVacancyExtractor` (BAML-typed client over OpenAI; `apps/etl/baml_src/extract-vacancy.baml` is the single source of truth for schema + prompt + per-field instructions; generated TS lives in `apps/etl/src/baml_client/`; → ADR-0004) or `PlaceholderVacancyExtractor` (static shape, default). The activity depends only on the token; the extractor returns the BAML-generated `ExtractedVacancy` type directly (no parallel Zod schema).
- `StorageModule` / `StorageService` — S3-compatible client over `@aws-sdk/client-s3` (`forcePathStyle: true`, so MinIO / Cloudflare R2 / AWS S3 all work via `STORAGE_*` env vars). Methods: `upload`, `download`, `ping` (HeadBucket, used by `/healthz`).
- `main.ts` — loads `.env` via explicit `dotenv` path (resolves to repo `.env` from `dist/main.js`), then `NestFactory.create(AppModule)` + `app.listen(PORT)` (default 3000).
- `baml_src/` (sibling of `src/`) — BAML DSL: `clients.baml`, `generators.baml`, `extract-vacancy.baml`. `pnpm baml:generate` writes the typed TS client to `src/baml_client/` (committed). Consumed only by `BamlVacancyExtractor` in `src/baml-extraction/`.

`libs/database` currently contains:

- `DatabaseModule` — `@Global()`, provides the `DRIZZLE` token (typed Drizzle instance).
- `drizzle.provider.ts` — builds `pg` pool from `DATABASE_URL` and returns `drizzle(pool, { schema })`.
- `schema/*` — tables: `sources`, `rss_ingests`, `rss_records`.
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

## Current gaps

- E2E smoke against production infrastructure (Temporal Cloud + R2/S3) is the last open item of Stage 04 — see [migration tracker T13](../journal/migrations/rss-temporal.md).
- No lint/format pipeline yet (Stage 05).
- No CI yet (build + migrate + seed + healthz smoke). Stage 05.
- LLM extraction is wired but disabled by default; flipping `LLM_EXTRACTION_ENABLED=true` requires a valid `OPENAI_API_KEY`.
