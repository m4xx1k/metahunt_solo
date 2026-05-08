# RSS + Temporal port to `metahunt`

**Started:** 2026-04-27 · **Closed:** 2026-05-03 · **Stage:** 04 · **Status:** done · **Decision:** [ADR-0003](../../decisions/0003-temporal-orchestration.md)

Migration of the working Temporal-based RSS ingestion pipeline from the legacy prototype `_metahunt/apps/etl/src/rss/` into the pnpm-workspace monorepo, then wired into `AppModule`.

## Outcome

T0–T13 shipped. RSS pipeline runs on Temporal with four activities (`fetchAndStore` / `parseAndDedup` / `extractAndInsert` / `finalizeIngest`), `rssIngestWorkflow` per source plus `rssIngestAllWorkflow` driven by a Temporal Schedule (06:00–22:00 Europe/Kyiv, overlap `SKIP`). Out-of-scope additions that landed alongside: aggregated `/healthz` (Postgres + S3 + Temporal), Temporal Cloud API-key auth, BAML extractor swap-in (→ ADR-0004). Stage 04 closed.

## Decisions (locked at 2026-04-27..29)

| Question | Choice |
|---|---|
| Orchestration | **Temporal** (`nestjs-temporal-core` + `@temporalio/*`). See ADR-0003. |
| Storage location | **`apps/etl/src/storage/`** (mirrors legacy). No second consumer yet — promote to `libs/storage` only when needed. |
| AI extraction | **Pluggable `VacancyExtractor` abstraction behind `VACANCY_EXTRACTOR` token.** Provider selected at module-bind time via `EXTRACTOR_PROVIDER`. Default `placeholder`; production uses `baml` (→ ADR-0004). Swapping providers later = add a new impl + update the factory. |
| Test framework | **Jest** — matches Nest CLI defaults. |
| `workflowsPath` | **`resolve(__dirname, 'workflows')`** in `rss.module.ts`. Works under spec (`src/`), `nest start` (`dist/`), and `node dist/main.js`. Legacy `process.cwd()` form silently broke under `pnpm --filter`, which sets cwd to the package dir. |
| Workflow `.ts` delivery to runtime | **Nest CLI `assets` rule** in `apps/etl/nest-cli.json` copies `rss/workflows/**/*.ts` → `dist/`. Standard Dockerfile already ships `dist/`, so workflow sources travel with it. |
| Scheduler API | **Two methods: `ingestRemote()` (rssUrl IS NOT NULL) and `ingestAll()` (every source). No boolean parameter.** Each call site self-documenting; supersedes legacy `ingestAll(local: boolean)`. |
| `autoStart` in tests | **Gated on `NODE_ENV !== 'test'`** so `AppModule` smoke specs compile the DI graph without dialing Temporal. |
