# Architecture overview

> Snapshot — describes the state **right now**. If something drifts from the code, update this file.

## Big picture

metahunt — job aggregator for the Ukrainian IT market. Current baseline is a running HTTP ETL shell with a real Postgres/Drizzle connection and migration/seed workflow.

## Monorepo

pnpm workspaces. Workspaces declared in `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "libs/*"
```

Each package has its own `package.json` and its own dependencies. Local deps are wired via `workspace:*`.

| Package | Type | Path | Purpose |
|---|---|---|---|
| `@metahunt/etl` | app | `apps/etl/` | NestJS HTTP app, process entry point. Deployed to Railway. |
| `@metahunt/web` | app | `apps/web/` | Next.js 16 public feed, campaign landing, CV matching, account, and operator UI. Deployed to Vercel. |
| `@metahunt/database` | lib | `libs/database/` | Shared Drizzle/Postgres module and schema |

Why pnpm workspaces and not the Nest CLI monorepo — see ADR-0001. Why frontend lives here too — see ADR-0005.

## Build model

- `libs/database` is compiled with `tsc` into its own `dist/`. The `main` field in the lib's `package.json` points to `dist/index.js`. Consumers therefore resolve compiled code, not sources.
- `apps/etl` is built with `nest build` (which calls `tsc` under the hood via nest-cli). The `@metahunt/database` import is resolved through a symlink at `apps/etl/node_modules/@metahunt/database`.
- Topological order: lib first, then app. The root `pnpm build` script does this sequentially via `pnpm --filter`.

## NestJS layout

### Module grouping (folder map)

`src/` modules are grouped into folders by stage in the data's journey, not
flat. Numeric prefixes force pipeline order over alphabetical; `admin/` and
`platform/` stay unnumbered as cross-cutting layers. The NestJS module graph is
independent of folder location — this is purely a navigability convention.

```
src/
  01-ingest/    rss                                    # bronze: raw vacancies in
  02-enrich/    extraction, extraction-cost, loader, dedup  # bronze → silver
  03-discovery/ feed, market, tracks                   # public read API over silver
  04-notify/    telegram, users                        # outbound: digests + subscriptions
  admin/        taxonomy, monitoring                   # operator: moderation + observability
  platform/     config, storage, temporal, health, shared   # cross-cutting infra (no domain)
  workflows/    barrel that aggregates each stage's Temporal workflows
  baml_client/  generated BAML client (consumed by 02-enrich/extraction)
  app.module.ts, app.controller.ts, main.ts           # root composition + entry
```

Rule of thumb: dependency arrows flow downstream along the pipeline (`ingest`
never imports `discovery`), `platform/` is a leaf (depends on nothing domain),
and cross-stage handoffs go through the DB (bronze/silver tables) + Temporal —
not cross-stage DI — which keeps each stage independently extractable later.

`apps/etl` currently contains:

- `AppModule` — imports `ConfigModule` (global, with env validation), `DatabaseModule` (global), `StorageModule`, `TemporalInfraModule`, `RssModule`, `LoaderModule`, `FeedModule`, `MarketModule`, `TracksModule`, `DedupModule`, `TaxonomyModule`, `MonitoringModule`, `ExtractionCostModule`, `UsersModule`, `TelegramModule`. Registers `AppController` + `HealthController`. CORS allows only the normalized `WEB_BASE_URL` origin (set in `main.ts`); operator endpoints also require a bearer token with the `admin` role.
- `AppController` — `GET /`: runs `SELECT 1`, returns `{ status: "ok", db: "up" }` (legacy canary; Railway healthcheck is `/healthz`).
- `HealthController` — `GET /healthz`: aggregated Postgres + S3 + Temporal check via `Promise.all` with per-call latency capture. 200 if all three are ok; 503 with per-dependency error detail otherwise.
- `RssModule` — full RSS ingest pipeline. Imports `StorageModule` + `ExtractionModule` + `TemporalModule.registerAsync({ isGlobal: true, ... })`. Providers: `RssParserService`, four activities (`RssFetch/Parse/Extract/Finalize`), `RssSchedulerService`. Controller: `RssController`. The workflow finalizes failures by `workflow_run_id`, so an ingest created before a fetch/storage failure does not remain `running` after activity retries exhaust.
- `RssController` — operator API. `POST /rss`: 202 + `{ triggered: "all" }`, fire-and-forget `scheduler.ingestAll()`. `POST /rss/extract-missing?limit=N`: synchronous backfill that runs `extractAndInsert` for pending rows or rows whose `extracted_data` has `_error` (default 100, max 500). Returns `{ attempted, succeeded, failed }`. Used to recover records skipped by extraction or with a persisted failed attempt.
- `LoaderModule` — silver-layer per-vacancy pipeline. Providers: `CompanyResolverService` (per-source identifier with slug fallback), `NodeResolverService` (race-safe alias-keyed `nodes` lookup, `status='NEW'` until moderated), `VacancyLoaderService` (transactional latest-record-wins vacancy write + `vacancy_nodes` rewrite from an extracted record), `LoaderBackfillService`, `LoadVacancyActivity`. A newer source record invalidates its listing's embedding and duplicate-cluster assignment in the same transaction; an older replay is a no-op. Controller: `LoaderController`.
- `LoaderController` — `POST /loader/backfill?limit=N`: synchronous in-process backfill that runs `VacancyLoaderService.loadFromRecord` for successfully extracted `rss_records` without a matching vacancy (default 100, max 500). Rows with an extraction `_error` remain retryable by the RSS backfill. Used to recover records whose `vacancyPipelineWorkflow` failed.
- `VacanciesModule` — public read API over the silver feed. `VacanciesController` exposes `GET /vacancies` (list + filter, pagination via `page`/`pageSize`, query via `q`, plus `includeRoleless` / `includeAllSkills` flags). `VacanciesService` runs a Drizzle list query joining `sources`, `companies`, role/domain `nodes`, `rss_records` (link, publishedAt) and a second batched skills query keyed by vacancy id. Default behaviour surfaces only `nodes.status='VERIFIED'` for role/domain/skills and hides vacancies without a verified role; flags lift those gates. Wire contract: `vacancies.contract.ts` (DTO + query types). No auth — public read.
- `TaxonomyModule` — authenticated operator moderation API at `/admin/taxonomy/*`. Read endpoints: `coverage`, `nodes` (unified list with `type`, `status` (comma-separated, default `NEW,VERIFIED`), `q`, `blocked`, `page`, `pageSize`; per-node `vacanciesBlocked` is SKILL via `vacancy_nodes`, ROLE/DOMAIN via the column on `vacancies`), `nodes/search?type=…&q=…` (verified-only target picker), `nodes/:id`, `nodes/:id/fuzzy-matches`. Write endpoints: `PATCH nodes/:id/verify|hide|rename` (rename promotes the old canonical to an alias; conflicts return 409 with `suggestion.mergeTargetId`) and `POST nodes/:id/merge-into/:targetId`. `TaxonomyService` aggregates verified-vs-new-vs-missing per axis, ranks NEW nodes by `vacancies_blocked`, and computes trigram suggestions (per-type threshold matrix; SKILL adds `word_similarity` for token-boundary respect).
- Workflows (loader): `apps/etl/src/02-enrich/loader/workflows/vacancy-pipeline.workflow.ts` — `vacancyPipelineWorkflow(rssRecordId)` runs `loadVacancy` today; future stages (dedup, telegram) append here without rewrite. Started as an `ABANDON` child of `rssIngestWorkflow` per successfully extracted record, with deterministic `workflowId = vacancy-pipeline-<rssRecordId>` and `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` so a failed pipeline retries on the next ingest pass without blocking the happy path.
- Workflows barrel: `apps/etl/src/workflows/index.ts` aggregates `rss/workflows` + `loader/workflows` so the Temporal worker bundles every feature's workflows from one `workflowsPath`.
- `MonitoringModule` — authenticated operator observability over the ETL pipeline. `MonitoringController` exposes six endpoints under `/monitoring`: `stats` (totals + last-24h + per-source latest run), `sources`, `ingests` + `ingests/:id`, `records` + `records/:id`, all with offset/limit pagination and inline query parsing (`query-parsing.ts`, mirrors the `/rss` style). `MonitoringService` does the joins/aggregations directly via the global Drizzle instance (counts of records-per-ingest and extracted-per-ingest computed in SQL, not N+1). `listRecords` and `getRecord` return identical shapes — both include `description` and `extractedData` — so the web feed renders `RssRecordCard` without an extra detail fetch.
- `ProductAnalyticsModule` — administrator-only first-party funnel and identity-health API at `/admin/product-analytics/overview`. It aggregates pseudonymous journeys, critical product events (including journey-attributed feed clicks, kept distinct from Telegram digest clicks), per-subscriber activity, legacy coverage, account-to-journey joins, delivery evidence, and correlation gaps without selecting Telegram identifiers or profile data. The ordered funnel counts each step independently rather than requiring an unbroken chain from `landing_view`. The `/dashboard/analytics` operator screen renders this as a tabbed (funnel/subscribers/identity/journeys) dashboard with charts, fetching over the same cookie-backed SSR session as the rest of the console (see Deployment below).
- `RssSchedulerService` — two methods, no boolean: `ingestRemote()` (sources with `rssUrl IS NOT NULL`) and `ingestAll()` (every source; the HTTP-trigger use-case). Both call `temporal.startWorkflow("rssIngestWorkflow", [source.id], ...)` per source. Implements `OnApplicationBootstrap` and (re)installs a Temporal Schedule `rss-ingest-hourly` on every boot — calendar spec `{ minute: 0, hour: { start: 6, end: 22, step: RSS_INGEST_INTERVAL_HOURS } }`, timezone `Europe/Kyiv`, overlap policy `SKIP`, action starts `rssIngestAllWorkflow`. If the schedule already exists, the service updates its spec/action via the schedule handle so env-driven cadence changes apply on restart.
- Workflows: `apps/etl/src/01-ingest/rss/workflows/{rss-ingest.workflow.ts, rss-ingest-all.workflow.ts, index.ts}` — barrel pattern so the Temporal worker bundler can resolve the workflowsPath directory. `rssIngestAllWorkflow` (driven by the Temporal Schedule) starts `rssIngestWorkflow` children in deterministic batches of five with `parentClosePolicy: ABANDON`; one failed child start does not block other sources.
- Activities chain: `listRemoteSources` (used by `rssIngestAllWorkflow`) → `fetchAndStore` (fetch RSS XML, write `rss_ingests`, upload XML to S3; local/test may fall back to a fixture, production never does) → `parseAndDedup` (download XML, parse, derive per-source `external_id`, suppress exact hashes within the same source, insert new `rss_records`) → `extractAndInsert` (delegate to `VacancyExtractor`, persist `extracted_data` + `extracted_at`) → `finalizeIngest` (set `rss_ingests.status = completed | failed` + `finishedAt`). Extraction settles in deterministic batches of ten; successful records start `vacancyPipelineWorkflow` children in batches of 25 (`ABANDON`, deterministic id).
- `ExtractionModule` — provides the `VACANCY_EXTRACTOR` token. Factory switches on `EXTRACTOR_PROVIDER ∈ {baml, placeholder}`: `BamlVacancyExtractor` (BAML-typed client over OpenAI; `apps/etl/baml_src/extract-vacancy.baml` is the single source of truth for schema + prompt + per-field instructions; generated TS lives in `apps/etl/src/baml_client/`; → ADR-0004) or `PlaceholderVacancyExtractor` (static shape, default). The activity depends only on the token; the extractor returns `{ data: ExtractedVacancy | null, meta: { promptVersion, usage, error? } }` — failures resolve with `data = null` rather than throwing, so the activity can persist the failed attempt's token usage before re-throwing for Temporal retry. `BamlVacancyExtractor` injects DRIZZLE to fetch VERIFIED ROLE + DOMAIN canonical names (cached 60s) and passes them to `b.ExtractVacancy(text, knownRoles, knownDomains)` as soft prompt hints. `PROMPT_VERSION` is a manual integer constant bumped per meaningful prompt change. Model pricing lives in `pricing.ts` (`MODEL_PRICING_USD_PER_MTOK`); `_usage.model` is read from `OPENAI_MODEL` env at call time because BAML's `LlmCall.clientName` exposes the BAML client name, not the underlying OpenAI model.
- `ExtractionCostModule` — read-only spend analytics. `ExtractionCostController` exposes `GET /extraction-cost/summary` returning `{ total, last24h, byPromptVersion[], byModel[], recent[] }`. `ExtractionCostService` queries the `extraction_cost` SQL view (migration `0009`) which parses the `_v` / `_usage` sidecar on `rss_records.extracted_data` and computes `cost_usd` via CASE-on-model branches. Web counterpart at `/dashboard/extraction`.
- `AnalyticsModule` — global product-event boundary. A public, rate-limited allow-list accepts critical browser events; product mutations atomically write `analytics_outbox`, and a retrying `AnalyticsOutboxDispatcher` materializes `product_events` before forwarding the same pseudonymous journey identity to `PostHogSink`. Feature services call domain methods on `AnalyticsService`; deterministic insert IDs make retries idempotent. Raw errors, Telegram identifiers, account UUIDs, CV content, and full filter payloads are excluded. Dispatcher and PostHog failures cannot fail subscription or delivery behavior.
- `CvModule` — account-bound CV upload and matching. Raw CV text is sent to DeepSeek for extraction but not persisted; derived candidate fields and skills are owner-scoped. `GET /cv/samples`, `GET /cv/samples/:id/matches`, and `GET /cv/samples/:id/role-suggestions` are the only public sample surfaces; every uploaded-candidate read, match, role-suggestion, recommendation, and mutation requires JWT ownership. `GET /cv/:id/role-suggestions` scores each VERIFIED ROLE by the smoothed share of its last-30d vacancies the candidate covers at GOOD+ (Laplace `(good+1)/(total+4)`, floors `total>=10` / `score>=0.05`, declared CV role pinned first; cold-start falls back to mean coverage with `reduced: true`) — constants next to `FIT_*_MIN` in `ranking.contract.ts`, selection math in `role-suggestions.derive.ts`. Matches accept `roleIds` (ROLE slugs) as a hard `roleNodeIds` filter, mirroring `domainIds`.
- `AccountModule` — JWT-protected `/me` reads and mutations for CVs, Telegram subscriptions, and permanent account deletion. `DELETE /me` removes the Telegram identity, owned and same-chat subscriptions, notification history, ownership links, and final-owner derived candidates in one transaction. Database cascades are migration `0028`; the JWT guard rechecks account existence and current roles so deleted sessions and stale admin claims stop immediately.
- `UsersModule` — waitlist signup write API. `UsersController` exposes `POST /users/subscribe` with body `{ email, source }`; `UsersService` runs `INSERT ... ON CONFLICT DO NOTHING RETURNING id` against the `users` table (migration `0010`) and returns `{ status: "subscribed" | "already_subscribed" }` so the client never has to handle a 409. Email is lowercased server-side; `source` is validated against `ALLOWED_SIGNUP_SOURCES`. Consumed by `FinalCTAForm` on the landing page + `/welcome`.
- `StorageModule` / `StorageService` — S3-compatible client over `@aws-sdk/client-s3` (`forcePathStyle: true`, so MinIO / Cloudflare R2 / AWS S3 all work via `STORAGE_*` env vars). Methods: `upload`, `download`, `ping` (HeadBucket, used by `/healthz`).
- `main.ts` — loads `.env` via explicit `dotenv` path (resolves to repo `.env` from `dist/main.js`), then `NestFactory.create(AppModule)` + `app.listen(PORT)` (default 3000).
- `baml_src/` (sibling of `src/`) — BAML DSL: `clients.baml`, `generators.baml`, `extract-vacancy.baml`. `pnpm baml:generate` writes the typed TS client to `src/baml_client/` (committed). Consumed only by `BamlVacancyExtractor` in `src/baml-extraction/`.

`libs/database` currently contains:

- `DatabaseModule` — `@Global()`, provides the `DRIZZLE` token (typed Drizzle instance).
- `drizzle.provider.ts` — builds `pg` pool from `DATABASE_URL` and returns `drizzle(pool, { schema })`.
- `schema/*` — tables: `sources`, `rss_ingests`, `rss_records` (bronze); `companies`, `company_identifiers`, `nodes` (role/skill/domain taxonomy; `slug` is the URL-facing id — `?roles=backend-engineer` — minted once at ingest, immutable on rename, unique per `(type, slug)`; slugs resolve back to ids at the feed/ranking/cv/subscription API boundary via `NodeSlugResolver`), `node_aliases`, `vacancies`, `vacancy_nodes` (silver); `node_tech_meta` (LLM-classified skill metadata category/stack/is_core/generic — gates reverse-ATS recs + ranking demote, ADR-0010); `users`; `analytics_journeys`, `analytics_outbox`, and `product_events` (pseudonymous first-party activation ledger with transactional hand-off); `digest_deliveries` (retry-stable delivery envelopes and progress). `subscriptions.journey_id` joins delivery state back to the browser/API journey; legacy rows are backfilled without fabricated events. `subscriptions` also carries nullable `tg_username`/`tg_first_name`, captured at Telegram link time and backfilled for pre-existing chats via the Telegram Bot API. Materialized views: `node_stats` (IDF weights), `node_skill_cooc` (skill↔skill NPMI co-occurrence). Enums: `seniority`, `work_format`, `employment_type`, `english_level`, `currency`, `engagement_type`, `node_type`, `node_status`, `skill_category`.
- `migrations/*` + `migrations/meta/*` — drizzle SQL + snapshots/journal.
- `seeds/*` — initial reference seed (`sources`: Djinni, DOU).

`@Global()` means `apps/etl` (and any future app) **must not** re-import `DatabaseModule` in submodules — one import in the root module is enough.

## Dependencies

| Package | Runtime deps |
|---|---|
| `@metahunt/database` | `@nestjs/common`, `@nestjs/config`, `drizzle-orm`, `pg` |
| `@metahunt/etl` | `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `class-validator`, `class-transformer`, `rxjs`, `@metahunt/database`, `drizzle-orm`, `fast-xml-parser`, `zod`, `@aws-sdk/client-s3`, `nestjs-temporal-core`, `@temporalio/{client,worker,workflow,activity}`, `@boundaryml/baml` |

## Runtime and env

- Local DB runs in docker (`pgvector/pgvector:pg16`) on `localhost:54322`.
- `db:migrate` and `db:seed` scripts load env via `dotenv/config`.
- ETL runtime loads root `.env` two redundant ways: `node --env-file-if-exists=../../.env` in the prod start scripts (Node native) AND `dotenv.config({ path: resolve(__dirname, "../../../.env") })` in `main.ts` (works under `nest start --watch` too). Nest's `ConfigModule.forRoot({ ignoreEnvFile: true, validate })` then validates the resulting `process.env`.
- In server environments (Railway), there is no `.env` file — `dotenv` silently no-ops and process-level env from the platform takes over. Same code path.
- Temporal: `TEMPORAL_API_KEY` empty → plaintext to `localhost:7233` (local). `TEMPORAL_API_KEY` set → automatic `tls: true` + API-key auth (Temporal Cloud). `TEMPORAL_MAX_CONCURRENT_ACTIVITIES` bounds activity execution across the worker (default 10, range 1–100).
- RSS schedule: `RSS_INGEST_INTERVAL_HOURS` (default 1, range 1..16) controls how often the daily ingest fires inside the 06:00–22:00 Europe/Kyiv window. The schedule is owned by Temporal Server, not Nest's `@Cron` — installed at app boot, survives restarts, manageable from the Temporal UI.
- LLM extraction off by default (`EXTRACTOR_PROVIDER=placeholder` → `PlaceholderVacancyExtractor`). Set `EXTRACTOR_PROVIDER=baml` + `OPENAI_API_KEY` to enable real extraction.

## Local infra (docker-compose)

Split in two: `compose.infra.yaml` (the shared services below) + `compose.yaml`
(the etl + web app stack, live-reloaded via Docker Compose Watch). `pnpm
docker:infra` brings up just the shared services (for running the apps natively);
`pnpm docker:dev` brings up infra + apps with hot-reload. Full guide:
[`md/runbook/docker-dev.md`](../runbook/docker-dev.md).

| Service | Image | Ports | Purpose |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg18` | `54323:5432` | App + Temporal Postgres (external volume `metahunt_railway_pgdata`) |
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
- Auth: Telegram login only (Clerk removed). Consumer login mints the app's own JWT (Bearer, localStorage) — see [`md/runbook/telegram-auth.md`](../runbook/telegram-auth.md). The operator console is the single `app/dashboard` subtree (`/dashboard`, `/dashboard/analytics|costs|sources|runs|vacancies|dedupe|taxonomy` + `runs/[id]`, `records/[id]`), client-gated by `AdminGuard` (requires a Telegram session with the `admin` role; membership via `ADMIN_TELEGRAM_IDS` on the API), and every operator API controller also enforces the same JWT + role server-side. Login/logout also sync an httpOnly session cookie (`POST`/`DELETE /api/session`), so the console's server-rendered data fetches carry the Bearer token too; `app/dashboard/layout.tsx` redirects home when no session cookie exists, and `error.tsx` catches a stale/non-admin one. Landing/feed stay public.
- Acquisition: `/radar` lists disciplines with live supply and links to `/radar/[track]`, one landing per track that creates the matching cold role subscription directly, shows the 3 most-recent matching vacancies as concrete proof, carries bounded campaign identifiers into PostHog events, and hands off to Telegram without requiring a CV or site account. `/vacancy/[id]` is a public, indexable per-vacancy detail page (real OG/Twitter metadata, sanitized description HTML, dedup-count stat) for sharing a single listing outside the feed. `/privacy`, `/robots.txt`, and `/sitemap.xml` are public; account and operator route groups are `noindex`.
- Product analytics: a browser-local journey UUID is included in subscription creation and critical browser events. The API, Telegram handler, and digest worker reuse it. Account attribution is derived from the owned subscription rather than assigning a permanent owner to the browser journey, and no account or Telegram identifiers are sent to PostHog.
- Activation value: a fresh Telegram `/start <subscription>` renders the existing 14-day preview immediately after confirming the link. It shows at most three matches (or an explicit zero state), preserves subscription attribution on apply links, emits `activation_value_shown`, and fails independently of the already-completed activation.

## Current gaps

- BAML prompt v2 shipped (canonical-taxonomy injection + anti-fluff per-field rules + few-shot examples — see [migration tracker](../journal/migrations/_done/extraction-prompt-v2.md) and [runbook](../runbook/extraction-cost.md)); the deferred empirical v1→v2 SKILL-coverage delta is now an input to Stage 09 evidence-led calibration.
- Moderator write-path on `/admin/taxonomy/*` shipped (verify, hide, rename, merge) — see [`taxonomy-workspace`](../journal/migrations/_done/taxonomy-workspace.md). No bulk operations yet.
- The production event chain has not yet been verified as one reproducible landing → linked subscription → first digest → digest click funnel, and no 7/30/90-day acquisition baseline is recorded in the repository — see the end-to-end funnel test gate in [`roadmap.md`](../roadmap.md#stage-08--first-user-validation).
- Public privacy disclosure and self-service account deletion exist. Provider-log/backups wording, analytics consent posture, and legal-controller ownership still require explicit owner review before scaled CV traffic.
- Extraction uses the direct DeepSeek API when `EXTRACTOR_PROVIDER=baml`; OpenAI remains in the separate semantic-dedup confirmation path. Empirical extraction and match quality still need real-user sampling.
