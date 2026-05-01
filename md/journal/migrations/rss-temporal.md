# RSS + Temporal port to `metahunt`

**Started:** 2026-04-27 · **Stage:** 04 · **Decision:** [ADR-0003](../decisions/0003-temporal-orchestration.md)

Migration of the working Temporal-based RSS ingestion pipeline from the legacy prototype `_metahunt/apps/etl/src/rss/` into the pnpm-workspace monorepo at `metahunt/apps/etl/src/rss/`, then wired into `AppModule`. Stage 04 ("first ETL job") is unblocked when this migration's E2E task (T13) passes.

## Resume here

**Done so far (13 / 14):** T0–T11 (see status table) · T12 RssModule wired into AppModule (12 suites / 43 tests green; build clean). Plus an out-of-scope addition driven by the deploy: aggregated `GET /healthz` controller and Temporal Cloud API-key support (`TEMPORAL_API_KEY` enables `tls: true` automatically).

**Pick up next:** **T13 — End-to-end smoke verification.** Locally already verified by hand (curl /rss → 202 → workflows complete in Temporal UI, rss_ingests/rss_records populated, MinIO bucket has XML payloads). Production smoke happens on the first Railway deploy: see [`md/runbook/railway-deploy.md`](../../runbook/railway-deploy.md) for the env-var matrix (Temporal Cloud + R2/S3) and the post-deploy curl checklist. On success: mark Stage 04 **done** in `roadmap.md`, add a release note, and refresh `architecture/overview.md` if anything drifted.

To run the local stack while working: `pnpm db:up` (brings up Postgres + MinIO + Temporal + UI in one shot).

## Status

| # | Task | Status | Done in |
|---|---|---|---|
| T0  | Bootstrap Jest in `apps/etl` | ✅ done | 2026-04-27 |
| T1  | Port `utils/vacancy-filter.ts` | ✅ done | 2026-04-27 |
| T2  | Port `RssParserService` + spec + XML fixtures | ✅ done | 2026-04-27 |
| T3  | Port `StorageModule` + add MinIO to `docker-compose.yml` | ✅ done | 2026-04-28 |
| T4  | Add Temporal server to `docker-compose.yml` + bootstrap SDK deps | ✅ done | 2026-04-28 |
| T5  | Port `RssFetchActivity` + spec | ✅ done | 2026-04-28 |
| T6  | Port `RssParseActivity` + spec | ✅ done | 2026-04-28 |
| T7  | Port `RssExtractActivity` + spec (OpenAI behind extractor abstraction) | ✅ done | 2026-04-28 |
| T8  | Port `RssFinalizeActivity` + spec | ✅ done | 2026-04-28 |
| T9  | Port `rss-ingest.workflow.ts` | ✅ done | 2026-04-28 |
| T10 | Port `RssSchedulerService` + spec | ✅ done | 2026-04-29 |
| T11 | Port `RssController` + spec | ✅ done | 2026-04-29 |
| T12 | Wire `RssModule` into `AppModule` | ✅ done | 2026-04-29 |
| T13 | End-to-end smoke verification | ⏳ pending | |

After each task: update the row's `Status` and `Done in` columns; on T13 success move Stage 04 to **done** in `roadmap.md` and add a release note in `journal/releases.md`.

## Why this migration

The legacy `_metahunt/` working tree already runs the full RSS pipeline (`fetch → parse → extract → finalize`) on Temporal, with raw XML in MinIO and structured records in Postgres. The new monorepo `metahunt/` has the foundation — Drizzle schema, env validation pre-declares Temporal/Storage/LLM vars — but no pipeline code. Porting unblocks Stage 04. Porting in *isolated, individually testable steps* lets each task ship and be reviewed independently across multiple sessions.

## Decisions (locked at 2026-04-27)

| Question | Choice | Rationale |
|---|---|---|
| Orchestration | **Temporal** (`nestjs-temporal-core` + `@temporalio/*`) | See ADR-0003. |
| Storage location | **`apps/etl/src/storage/`** (mirrors legacy) | No second consumer yet — promote to `libs/storage` only when needed. |
| AI extraction | **Pluggable `VacancyExtractor` abstraction; default impl is OpenAI; flag is `LLM_EXTRACTION_ENABLED`** (locked 2026-04-28, supersedes legacy Anthropic-in-activity) | The activity depends only on the `VACANCY_EXTRACTOR` token; provider is selected at module-bind time (`PlaceholderVacancyExtractor` when off, `OpenAiVacancyExtractor` when on). Swapping providers later (e.g. BAML) = add a new `VacancyExtractor` impl and update the factory; activity, workflow, and tests don't move. Env vars: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `LLM_EXTRACTION_ENABLED`. Anthropic env vars dropped from `env.validation.ts`. |
| Test framework | **Jest** | Matches Nest CLI defaults; legacy spec ports verbatim. |
| `workflowsPath` strategy | **`resolve(__dirname, 'workflows')`** in `rss.module.ts` (locked 2026-04-28) | Same expression works for spec (`src/rss/`), `nest start` (`dist/rss/`), and `node dist/main.js` (`dist/rss/`) — no dependency on `process.cwd()` or launch directory. The legacy `process.cwd()` form silently broke under `pnpm --filter`, which sets cwd to the package dir, not the repo root. |
| Workflow `.ts` delivery to dist/runtime | **Nest CLI `assets` rule** in `apps/etl/nest-cli.json` copies `rss/workflows/**/*.ts` → `dist/rss/workflows/` on build (locked 2026-04-28) | Standard `Dockerfile` already copies `apps/etl/dist/` into the runtime image; with the assets rule, workflow sources travel with `dist/` automatically. No extra `COPY` or runtime mount is needed. |
| Scheduler API shape | **Two methods: `ingestRemote()` (rssUrl IS NOT NULL) and `ingestAll()` (every source). No boolean parameter.** Shared loop in private `startWorkflows(sources)` (locked 2026-04-29, supersedes legacy `ingestAll(local: boolean)`) | Boolean call sites (`scheduler.ingestAll(true)`) are unreadable — the `true` doesn't tell the reader whether it means "live" or "include offline fixtures". With two methods, the call site is self-documenting: cron will call `ingestRemote()` once enabled; the HTTP `GET /rss` controller calls `ingestAll()` for dev-mode fixture-fallback runs. |

## Path-alias rewrites (apply uniformly)

- `@app/database` → `@metahunt/database`
- `import * as schema from '@app/database/schema'` → `import { schema } from '@metahunt/database'` (the new lib only re-exports `schema` via the barrel: `libs/database/src/index.ts:3`)
- `DRIZZLE`, `DrizzleDB` — same package: `@metahunt/database`

## Tasks

Each task lands at a verifiable boundary: tests pass after the task on its own, no orphaned imports, no broken build.

### T0 — Bootstrap Jest in `apps/etl` ✅

**Goal:** `pnpm --filter @metahunt/etl test` runs Jest against `*.spec.ts` files.

**Files (delivered):**
- `apps/etl/package.json` — devDeps: `jest@^29`, `ts-jest@^29`, `@types/jest`, `@nestjs/testing`. Scripts: `test`, `test:watch`.
- `apps/etl/jest.config.ts` — `preset: ts-jest`, `testEnvironment: node`, `testMatch: <rootDir>/src/**/*.spec.ts`, `setupFiles: jest.setup.ts`, `moduleNameMapper` for `@metahunt/database`.
- `apps/etl/jest.setup.ts` — sets `DATABASE_URL` to a fake postgres URL so `validateEnv` (which runs at `ConfigModule.forRoot()` evaluation time, before any `beforeAll`) doesn't throw when AppModule is imported in tests.
- `apps/etl/src/app.module.spec.ts` — smoke spec: `Test.createTestingModule({ imports: [AppModule] }).compile()`.

**Verify:** `pnpm --filter @metahunt/etl test` exits 0 with the AppModule spec passing.

---

### T1 — Port `utils/vacancy-filter.ts` ✅

**Goal:** Pure `isITVacancy(title)` available, fully covered by spec.

**Files (delivered):**
- `apps/etl/src/rss/utils/vacancy-filter.ts` — copied verbatim from legacy.
- `apps/etl/src/rss/utils/vacancy-filter.spec.ts` — table-driven cases: whitelist hits, blacklist hits, unknown rejected (strict), blacklist precedence over whitelist.

**Verify:** all 21 vacancy-filter cases pass.

---

### T2 — Port `RssParserService` + spec + XML fixtures ✅

**Goal:** Pure XML→items→hash service available in DI; legacy spec passes against Djinni/DOU fixtures.

**Files (delivered):**
- `apps/etl/src/rss/rss-parser.service.ts` — copied; **one deviation from legacy**: `XMLParser` is constructed with `processEntities: { enabled: true, maxTotalExpansions: Infinity }`. Newer `fast-xml-parser` (≥4.5) caps entity expansions at 1000 by default, which legitimate large RSS feeds exceed (Djinni 1062, DOU 1052). The cap is a DoS guard for untrusted XML — RSS sources we control don't need it. WHY-comment is in the file.
- `apps/etl/src/rss/rss-parser.service.spec.ts` — copied verbatim; loads fixtures via `__dirname/../../data/rss/*.xml`.
- `apps/etl/data/rss/djinni-rss.xml`, `apps/etl/data/rss/dou-rss.xml` — fixtures copied.
- `apps/etl/package.json` — added `fast-xml-parser`, `zod`.

**Verify:** parser spec — 3 cases (Djinni parse + filter, DOU parse + filter, hash stability) — passes.

---

### T3 — Port `StorageModule` + MinIO in compose ✅

**Goal:** S3-compatible upload/download available via DI (`StorageService.upload(key, body)`, `download(key)`); MinIO running locally; `rss-payloads` bucket pre-created.

**Files (delivered):**
- `apps/etl/src/storage/storage.service.ts`, `storage.module.ts` — copied verbatim from legacy.
- `apps/etl/src/storage/storage.service.spec.ts` — TDD-first; uses `aws-sdk-client-mock`. Two cases: (a) `upload` issues `PutObjectCommand` with configured bucket + given key + body; (b) `download` reassembles the buffer from a `GetObjectCommand` stream.
- `apps/etl/package.json` — added `@aws-sdk/client-s3` (runtime), `aws-sdk-client-mock` (dev).
- `docker-compose.yml` — added `minio` (ports `9000`/`9001`, root creds `metahunt`/`metahunt123` matching env defaults) and one-shot `minio-init` sidecar (`minio/mc`) that polls `mc alias set` until reachable, then `mc mb --ignore-existing local/rss-payloads`.
- Root `package.json` — `db:up` widened to `docker compose up -d` so MinIO + (post-T4) Temporal come up alongside Postgres.

**Verify:** `pnpm --filter @metahunt/etl test` → 4 suites, 26 tests, all green. `docker compose up -d` → API `:9000/minio/health/live` 200, console `:9001` 200, `mc ls local/` shows `rss-payloads`.

---

### T4 — Add Temporal to compose + bootstrap SDK deps ✅

**Goal:** Temporal server reachable at `localhost:7233`; UI at `localhost:8080`; SDK packages installed.

**Files (delivered):**
- `docker-compose.yml` — added `temporal` (`temporalio/auto-setup:1.26`, sharing the existing `db` service: auto-setup creates `temporal` + `temporal_visibility` databases inside the same Postgres, no app-data collision) and `temporal-ui` (`temporalio/ui:2.34.0`). Image tags pinned to match the previously verified versions in legacy `_metahunt/`.
- `apps/etl/package.json` — runtime deps added: `nestjs-temporal-core@^3.2.7`, `@temporalio/client@^1.16.1`, `@temporalio/worker@^1.16.1`, `@temporalio/workflow@^1.16.1`, `@temporalio/activity@^1.16.1`. devDep added: `ts-loader@^9.5.2` (for the webpack workflow-bundler hook in T12).

**Verify:** `docker compose up -d` brings up `temporal` + `temporal-ui`; `:8080/api/v1/namespaces` returns `default` and `temporal-system`. `pnpm install` resolved cleanly. Existing test suite still green (4 suites, 26 tests).

---

### T5 — Port `RssFetchActivity` + spec ✅

**Goal:** Activity that creates an `rss_ingests` row, fetches XML (with file fallback), uploads to storage, returns `ingestId`.

**Files (delivered):**
- `apps/etl/src/rss/activities/rss-fetch.activity.ts` — ported from legacy with the standard path-alias rewrites: `@app/database` → `@metahunt/database`, and `import * as schema from '@app/database/schema'` → `import { schema } from '@metahunt/database'`. Body of `fetchAndStore` and the file-fallback helper unchanged.
- `apps/etl/src/rss/activities/rss-fetch.activity.spec.ts` — TDD-first; built `Test.createTestingModule` with `DRIZZLE` and `StorageService` overrides. Hand-rolled chained Drizzle mock (`select().from().where()`, `insert().values().onConflictDoNothing()`, `update().set().where()`) so the second `select` round can resolve a different array than the first. `@temporalio/activity#activityInfo`, global `fetch`, and `node:fs/promises#readFile` mocked at module/global scope; `StorageService.upload` is a `jest.fn` provided via `useValue`. Three cases: rssUrl + fetch ok → uses fetch (no readFile); rssUrl + fetch !ok → falls back to file (path ends with `${code}-rss.xml`); no rssUrl → straight to fallback. Each case asserts the storage key shape (`rss/${sourceId}/${ingestId}.xml`), the uploaded buffer content, and the update payload.

**Verify:** `pnpm --filter @metahunt/etl test` → 5 suites, 29 tests, all green (was 4/26 before T5).

---

### T6 — Port `RssParseActivity` + spec ✅

**Goal:** Activity that downloads XML, dedups by hash, inserts new `rss_records`, returns inserted IDs.

**Files (delivered):**
- `apps/etl/src/rss/activities/rss-parse.activity.ts` — ported from legacy with the standard path-alias rewrites (`@app/database` → `@metahunt/database`, `import { schema }` via the barrel). Body unchanged: `select` ingest → `storage.download` → `parser.parseXml` → `parser.filterItItems` → `select existing hashes via inArray` → diff → `insert(...).onConflictDoNothing().returning({ id })`.
- `apps/etl/src/rss/activities/rss-parse.activity.spec.ts` — TDD-first; **real** `RssParserService` provided as a `useValue` (no DI of its own — `new RssParserService()`); `DRIZZLE` and `StorageService` mocked. Drizzle mock is the same chained-builder pattern as T5, with `mockResolvedValueOnce` covering both `select` rounds (ingest row, then existing-hash list); the `insert` chain ends in a `returning` mock that resolves to the inserted-id list. Synthetic XML built in-test from a 4-item fixture (3 IT titles + 1 blacklisted "Senior Recruiter") so the filter is exercised on the way in. Two cases: all-new (existing = [], 3 rows written, hashes assert against `parser.computeHash`) and partial dedup (existing returns the first item's hash, only items 2–3 written).

**Verify:** `pnpm --filter @metahunt/etl test` → 6 suites, 31 tests, all green (was 5/29 before T6).

---

### T7 — Port `RssExtractActivity` + spec (OpenAI behind extractor abstraction) ✅

**Goal:** Activity reads a record's text and writes `rss_records.extracted_data` + `extracted_at`. Vendor-agnostic via a pluggable `VacancyExtractor` interface — the activity has no LLM-vendor coupling. Provider selected at module-bind time by `LLM_EXTRACTION_ENABLED`. Default impl: OpenAI. Future swap (e.g. BAML) = drop in a new `VacancyExtractor` impl.

**Files (delivered):**
- `apps/etl/src/extraction/extracted-vacancy.ts` — `ExtractedVacancy` zod schema (parity with legacy: salary, experience, employment_type, work_format, skills, english_level, seniority, specialization) + `EXTRACT_VACANCY_JSON_SCHEMA` (the function-tool JSON Schema, vendor-neutral).
- `apps/etl/src/extraction/vacancy-extractor.ts` — `VacancyExtractor` interface (`extract(text: string): Promise<ExtractedVacancy>`) + `VACANCY_EXTRACTOR` symbol DI token. **The single seam the activity depends on.**
- `apps/etl/src/extraction/placeholder.extractor.ts` — `PlaceholderVacancyExtractor` returns a static shape (legacy parity).
- `apps/etl/src/extraction/openai.extractor.ts` — `OpenAiVacancyExtractor` calls `chat.completions.create` with one function tool (`extract_vacancy`) and `tool_choice: { type: 'function', function: { name: 'extract_vacancy' } }`; parses `tool_calls[0].function.arguments` through the zod schema. Reads `OPENAI_API_KEY` and optional `OPENAI_MODEL` (default `gpt-4o-mini`) from `ConfigService`.
- `apps/etl/src/extraction/extraction.module.ts` — Nest module exporting `VACANCY_EXTRACTOR`. `useFactory` chooses `OpenAiVacancyExtractor` when `LLM_EXTRACTION_ENABLED=true`, else `PlaceholderVacancyExtractor`.
- `apps/etl/src/rss/activities/rss-extract.activity.ts` — depends only on `DRIZZLE` and `VACANCY_EXTRACTOR`. Reads record, builds prompt text, delegates to `extractor.extract`, writes `extractedData` + `extractedAt`. Throws if record missing.
- `apps/etl/src/extraction/openai.extractor.spec.ts` — `jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }))`; per-test `mockImplementation` returns a fake instance with `chat.completions.create`. Two cases: valid `tool_calls[0].function` payload → parsed; missing/empty tool_calls → throws `/No function tool_call/`.
- `apps/etl/src/rss/activities/rss-extract.activity.spec.ts` — extractor mocked via `useValue: { extract: jest.fn() }`. Two cases: extract returns data → record updated with `extractedData` + `extractedAt: Date`; record missing → throws `/Record .* not found/`, extractor never called.
- `apps/etl/src/config/env.validation.ts` — `ANTHROPIC_API_KEY`/`ANTHROPIC_EXTRACTION_ENABLED` removed; replaced with `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `LLM_EXTRACTION_ENABLED`. Same guard: `LLM_EXTRACTION_ENABLED=true` requires non-empty `OPENAI_API_KEY`.
- `apps/etl/package.json` — added `openai@^4.77.0` (resolved to 4.104.0).

**Verify:** spec suite green; `pnpm exec nest build` produces `dist/extraction/*.js` and `dist/rss/activities/rss-extract.activity.js` cleanly.

---

### T8 — Port `RssFinalizeActivity` + spec ✅

**Goal:** Activity that updates `rss_ingests.status` (`completed` or `failed`) and `finishedAt`.

**Files (delivered):**
- `apps/etl/src/rss/activities/rss-finalize.activity.ts` — ported with the standard path-alias rewrites; body unchanged. Spreads `errorMessage` only when present (avoids overwriting a previously-set message with `undefined`).
- `apps/etl/src/rss/activities/rss-finalize.activity.spec.ts` — DRIZZLE mocked with the same chained `update().set().where()` builder. Two cases: `finalizeIngest(id, 'completed')` → set payload has `status='completed'`, `finishedAt: Date`, **no** `errorMessage` key; `finalizeIngest(id, 'failed', 'boom')` → set payload includes `errorMessage: 'boom'`.

**Verify:** spec suite green.

---

### T9 — Port `rss-ingest.workflow.ts` ✅

**Goal:** Workflow file at the deterministic path expected by the webpack workflow-bundler.

**Files (delivered):**
- `apps/etl/src/rss/workflows/rss-ingest.workflow.ts` — copied verbatim from legacy. Imports only `@temporalio/workflow#proxyActivities` and `typeof Activity.prototype` for the four activities (purely type-level, erased at compile). No path-alias rewrites needed.

**Verify:** `pnpm exec nest build` → exit 0; `dist/rss/workflows/rss-ingest.workflow.js` produced. (Webpack bundler at worker boot is exercised in T12; this task only covers type-check + emit.)

---

### T10 — Port `RssSchedulerService` + spec ✅

**Goal:** Service that lists active sources and starts a Temporal workflow per source. **API redesigned vs legacy** — two methods, no boolean (see locked decision above).

**Files (delivered):**
- `apps/etl/src/rss/rss-scheduler.service.ts` — ported from legacy with the standard path-alias rewrites and **API redesign**:
  - `ingestRemote()` — `select().from(sources).where(isNotNull(rssUrl)).execute()`.
  - `ingestAll()` — `select().from(sources).execute()`.
  - Private `startWorkflows(sources: Source[])` holds the shared logging + `temporal.startWorkflow('rssIngestWorkflow', [source.id], { workflowId: \`rss-ingest-${source.id}-${Date.now()}\`, taskQueue: 'rss-ingest' })` loop.
  - `@Cron('0 * * * *')` import + decorator left **commented out** (HTTP-trigger only for now); when re-enabled, attach to `ingestRemote()`.
- `apps/etl/src/rss/rss-scheduler.service.spec.ts` — TDD-first; `TemporalService` provided as `useValue: { startWorkflow: jest.fn() }`; DRIZZLE mock is a chained-builder where `from()` returns an object with both `where` and `execute`, so `ingestRemote` resolves through `where→execute` and `ingestAll` resolves through `execute` directly. Two cases:
  - **A — `ingestRemote`** (1 source with rssUrl): asserts `where` called once, `executeViaWhere` called once, `executeDirect` not called, `startWorkflow` called with `['rssIngestWorkflow', [source.id], { workflowId: /^rss-ingest-{id}-\d+$/, taskQueue: 'rss-ingest' }]`.
  - **B — `ingestAll`** (1 remote + 1 local-only source, `rssUrl: null`): asserts `where` **not** called, `executeDirect` called once, `startWorkflow` called twice (in source order).

**Verify:** `pnpm --filter @metahunt/etl test` → 10 suites, 38 tests, all green (was 8/35 before T10).

---

### T11 — Port `RssController` + spec ✅

**Goal:** `GET /rss` triggers `RssSchedulerService.ingestAll()` (no-arg, post-T10 redesign).

**Files (delivered):**
- `apps/etl/src/rss/rss.controller.ts` — `triggerAll()` calls `void this.scheduler.ingestAll()` (fire-and-forget, same legacy semantics) and returns `{ triggered: 'all' }` with `@HttpCode(202)` so curl smoke gets a useful response body and the right "accepted, processing async" status code instead of legacy 200/empty.
- `apps/etl/src/rss/rss.controller.spec.ts` — `Test.createTestingModule` with mocked scheduler (`{ ingestAll, ingestRemote }` both `jest.fn()`). One case: `triggerAll()` calls `ingestAll()` exactly once with no args, **does not** call `ingestRemote`, returns `{ triggered: 'all' }`.

**Verify:** `pnpm --filter @metahunt/etl test` → 11 suites, 40 tests, all green (was 10/38 before T11). `pnpm exec nest build` → exit 0; `dist/rss/rss.controller.js` and `dist/rss/rss-scheduler.service.js` produced.

---

### T12 — Wire `RssModule` into `AppModule` ✅

**Goal:** `apps/etl/src/app.module.ts` imports `RssModule`; the full pipeline is reachable from the running process.

**Files (delivered):**
- `apps/etl/src/rss/rss.module.ts` — ported with locked adjustments:
  - **Dropped** `DatabaseModule.forRoot()` (already global at AppModule level).
  - **Dropped** `ScheduleModule.forRoot()` from legacy — `@Cron` is commented out, so the dep isn't installed; will add back when re-enabling cron.
  - **Added** `ExtractionModule` to `imports` (provides `VACANCY_EXTRACTOR` for `RssExtractActivity`).
  - `workflowsPath: resolve(__dirname, "workflows")` (per locked decision; works for spec/dev/prod).
  - Webpack `ts-loader` hook kept verbatim.
  - `autoStart: config.get<string>("NODE_ENV") !== "test"` — gate satisfies the previously-open AppModule-spec side effect (jest sets `NODE_ENV=test` automatically; under that flag the worker doesn't dial Temporal).
  - Library types `useFactory` as `(...args: unknown[]) => ...`, so the factory unpacks `ConfigService` from the args tuple manually.
- `apps/etl/src/rss/workflows/index.ts` — **barrel re-exporting `./rss-ingest.workflow`** (locked decision, supersedes initial directory-pointing). Without it the bundler's autogen entrypoint emits `require(<workflowsPath>)` and webpack default resolution can't find an `index.{ts,js}`, dying with `Module not found: Can't resolve '/abs/path/workflows'`. The barrel is the canonical Temporal Cloud + NestJS pattern (per Temporal community).
- `apps/etl/nest-cli.json` — `assets: [{ include: "rss/workflows/**/*.ts", outDir: "dist", watchAssets: true }]`. Both `rss-ingest.workflow.ts` and `index.ts` land in `dist/rss/workflows/` on build, so the standard `Dockerfile` (which copies `apps/etl/dist/`) ships them automatically — no extra `COPY`.
- `apps/etl/src/main.ts` — added `dotenv.config({ path: resolve(__dirname, "../../../.env") })` so `pnpm start:dev` (which uses `nest start --watch`, not the Node `--env-file-if-exists` flag the prod scripts use) reads the repo `.env`. dotenv is no-op when the file doesn't exist (Docker case) and never overrides existing process env, so prod runtime is unaffected.
- `apps/etl/src/app.module.ts` — added `import { RssModule } from "./rss/rss.module";` (and `StorageModule` + `HealthController` for the out-of-scope healthz addition).
- `apps/etl/src/app.module.spec.ts` — asserts all RSS providers + `RssController` + `HealthController` resolve from the compiled testing module.

**Verify:** `pnpm --filter @metahunt/etl test` → 12 suites, 43 tests, all green. `pnpm exec nest build` → exit 0; `dist/rss/workflows/{rss-ingest.workflow.{ts,js,d.ts},index.{ts,js,d.ts}}` produced. End-to-end locally: `pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm --filter @metahunt/etl start:dev`, then `curl http://localhost:3000/rss` → 202 → both `rssIngestWorkflow` runs `Completed` in Temporal UI; `rss_ingests` 2× `completed`; `rss_records` populated.

---

### T13 — End-to-end smoke verification

Once T0–T12 are green:

```bash
pnpm db:up                                  # starts postgres + minio + temporal
pnpm db:migrate && pnpm db:seed             # 3 migrations applied; 2 sources seeded (Djinni, DOU)
pnpm --filter @metahunt/etl start:dev       # http://localhost:3000
curl http://localhost:3000/rss              # 202 Accepted, body { triggered: "all" }; kicks off one workflow per source
```

Then verify:
- Temporal UI (`http://localhost:8080`): two `rssIngestWorkflow` executions, status `completed`.
- `psql $DATABASE_URL -c "SELECT status, count(*) FROM rss_ingests GROUP BY status"` → 2 `completed`.
- `psql $DATABASE_URL -c "SELECT count(*) FROM rss_records"` → > 0.
- With `LLM_EXTRACTION_ENABLED=true` + a real `OPENAI_API_KEY`, re-run; `rss_records.extracted_data` is non-null and matches the `ExtractedVacancy` zod shape (salary, skills, seniority, …).

On success: mark Stage 04 **done** in `roadmap.md`, write a release note in `journal/releases.md`, and update `architecture/overview.md` to describe the running pipeline (worker, Temporal, MinIO, `VacancyExtractor`).

## Open items

- _(none open)_ — the previous `AppModule` smoke-test side effect was resolved in T12 by env-gating `autoStart: config.get('NODE_ENV') !== 'test'`.
