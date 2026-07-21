# Releases / journal

Chronological log of changes. Don't duplicate git log — write what's useful for onboarding and understanding how the project evolved.

Format: group by date, short bullets inside. If a bullet has bigger context, link to an ADR / docs / PR.

---

## 2026-07-20

- **CORS allowlist** (`fix/cors-allowlist`). The API accepts browser cross-origin requests only from `WEB_BASE_URL`; the configured URL is normalized to an origin before middleware setup.

---

## 2026-04-26

- Monorepo scaffold on pnpm workspaces: `apps/etl` (`@metahunt/etl`) + `libs/database` (`@metahunt/database`, `@Global()` Nest module). Old `_metahunt/` archived as read-only reference. → ADR-0001
- `apps/etl` switched from headless `createApplicationContext` to a full HTTP server; `GET /` returns `{ greeting }` as a cross-workspace DI canary. → ADR-0002
- Dev scripts added: `pnpm dev` (parallel `tsc -w` + `nest start --watch`), `start:prod`, `start:debug`.
- Engineering docs (`md/`) set up with Snapshot + Journal layout; package-level `README.md` added for each package.
- `@metahunt/database` migrated from placeholder token to real Drizzle + Postgres provider (`DRIZZLE`) with schema, migrations, and seeds. Health endpoint verifies DB via `SELECT 1`.
- Env behavior unified: `node --env-file-if-exists=../../.env` for local; process env primary everywhere.
- Migration drift artifact `0004_purple_exodus` removed; migration hygiene rule documented.
- Railway IaC added: root `Dockerfile` (multi-stage, Node 22), `railway.json` with pre-deploy migrations, `.dockerignore`. SSH remote + git identity pinned to `m4xx1k`. → `md/runbook/railway-deploy.md`
- Docker build hardened through three iterations: recursive workspace install in `build` stage, `tsconfig.base.json` copied to runtime, workspace `node_modules` for `libs/database` copied so `ts-node` resolves during pre-deploy migrations.
- Railway `watchPatterns`, healthcheck path, and runbook operational rules finalized.

---

## 2026-04-28

- RSS+Temporal port — T3–T9 (StorageModule/MinIO, Temporal in compose, five activities, workflow). Docker Compose gained `minio` + `minio-init` sidecar and `temporalio/auto-setup` + UI. Activities ported under TDD: `RssFetchActivity`, `RssParseActivity`, `RssExtractActivity` (introduced `VacancyExtractor` interface + OpenAI impl), `RssFinalizeActivity`, and the `rssIngestWorkflow`. Suite: 9 suites / 37 tests. → [migration tracker](migrations/_done/rss-temporal.md)
- Extractor abstraction: `VACANCY_EXTRACTOR` token selects `PlaceholderVacancyExtractor` or `OpenAiVacancyExtractor` via `LLM_EXTRACTION_ENABLED`; future swap = new impl, no activity/workflow changes.
- `workflowsPath` locked to `resolve(__dirname, 'workflows')`; `rss/workflows/index.ts` barrel added (required by Temporal's webpack autogen entrypoint).

---

## 2026-04-29

- RSS+Temporal port — T10–T13 (`RssSchedulerService`, `RssController`, `RssModule` wired into `AppModule`, workflow bundler fix). `ingestAll()` / `ingestRemote()` replace the legacy `ingestAll(local)`. `GET /rss` returns `202 Accepted`. `autoStart` gated on `NODE_ENV !== 'test'`. Suite: 12 suites / 43 tests. → [migration tracker](migrations/_done/rss-temporal.md)
- `dotenv.config()` added to `main.ts` so `pnpm start:dev` resolves env without `--env-file-if-exists`.
- `GET /healthz` added: parallel Postgres + MinIO + Temporal checks, `200 ok` / `503 degraded`. Railway `healthcheckPath` switched to `/healthz`.
- Temporal Cloud support: `TEMPORAL_API_KEY` enables TLS + API-key auth; local dev stays plaintext.

---

## 2026-05-01

- BAML extractor lands as the single source of truth for vacancy shape, prompt, and per-field rules (`@boundaryml/baml@^0.222`, `apps/etl/baml_src/`). Schema redesigned to camelCase + nested (`salary.{min,max,currency}`, `skills.{required[],optional[]}`, `locations[]`, etc.). → ADR-0004
- OpenAI extractor and Zod re-validation removed; `EXTRACTOR_PROVIDER ∈ {baml, placeholder}`. `BamlVacancyExtractor` is one line: `return b.ExtractVacancy(text)`.
- Real-world fixture added: DOU.ua RSS item as TS module + BAML `test` block for prompt iteration.
- Suite: 12 suites / 43 tests.

---

## 2026-05-03

- Daily RSS ingest moved to a Temporal Schedule (`rss-ingest-hourly`, calendar-based, `SKIP` overlap, `Europe/Kyiv`). New `rssIngestAllWorkflow` fans out one child per source with `parentClosePolicy: ABANDON`. `RSS_INGEST_INTERVAL_HOURS` env var controls cadence.
- Extraction made per-record best-effort via `Promise.allSettled`; failure count recorded in `rss_ingests.error_message`.
- Activity retry policies normalized: `3` attempts, `5s/10s/20s` backoff; `finalizeIngest` keeps 5 attempts.
- `POST /rss/extract-missing?limit=N` added for synchronous backfill of un-extracted records.
- Child workflow IDs changed to `rss-ingest-<code>-<YYYY-MM-DDTHH-MM-SSZ>`.
- `md/runbook/failure-recovery.md` added. Suite: 13 suites / 48 tests.

---

## 2026-05-03 (frontend import)

- Frontend imported as `@metahunt/web` (`apps/web/`) from standalone `metahunt-client` repo (no history transfer). Vercel deploy approach switched to new project + sequential domain migration. Root `package.json` gained per-app scripts (`dev:web`, `build:web`, etc.). → ADR-0005, [migration tracker](./migrations/_done/frontend-migration.md), PR #4.
- Monitoring API added to ETL: six read-only endpoints under `MonitoringModule` (`/monitoring/{stats,sources,ingests,…}`), CORS `origin: "*"` for cross-origin dev access.
- First `apps/web` → backend integration: `lib/api/monitoring.ts` typed fetcher, Server-Component `Promise.all` fetch, URL-driven filter state, `/monitoring` page with stat cards + `RssRecordCard` feed. PR #5.

---

## 2026-05-05

- Silver-layer loader pipeline shipped (`feat/loader-pipeline`, T1–T18). Six new tables (`companies`, `company_identifiers`, `nodes`, `node_aliases`, `vacancies`, `vacancy_nodes`) + seven enums. `external_id` derived per-source at parse time, locked `NOT NULL`. → [migration tracker](./migrations/_done/loader-pipeline.md), [runbook](../runbook/loader-pipeline-smoke.md)
- New `apps/etl/src/loader/` module: `CompanyResolverService`, `NodeResolverService` (race-safe, alias-keyed), `VacancyLoaderService` (transactional upsert + `vacancy_nodes` rewrite), `LoaderBackfillService`, `LoadVacancyActivity`. `vacancyPipelineWorkflow` starts one child per extracted record; `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` enables retry on next ingest pass.
- Suite: 25 suites / 99 tests; DB smoke at `apps/etl/scripts/loader-smoke.ts`.

---

## 2026-05-06

- `fill-vacancies` CLI shipped (`apps/etl/scripts/fill-vacancies.ts`): walks bronze records into `vacancies` with streaming progress, taxonomy coverage instrumentation, and gap-list output per type. Re-run is a clean no-op. Verified: 86 bronze → 86 vacancies, 35 companies, 521 nodes as `status='NEW'`. → commit `ca6908d`
- Taxonomy seed reworked: `node_aliases` unique constraint moved to `(name, type)` (migration `0006`). Seed populated with 216 SKILL + 21 DOMAIN + 80 ROLE canonicals + 776 aliases, all `VERIFIED`. → commit `51223fc`, [migration tracker](./migrations/taxonomy-curation.md)
- `vacancy_nodes` PK collision fixed: duplicate `(vacancy_id, node_id)` rows from alias variants now deduplicated before insert, preferring `required=true`. → commit `921b4e1`
- Taxonomy moderation API: `/admin/taxonomy/{coverage,queue,nodes/:id,nodes/:id/fuzzy-matches}`. Trigram thresholds: ROLE/DOMAIN `minSim=0.55`, SKILL `minSim=0.65` + `word_similarity` gate. Migration `0007` enables `pg_trgm`. → commit `b6e1052`, [migration tracker](./migrations/taxonomy-curation.md)
- First gap-driven `nodes.json` iteration (Tier 1): ROLE coverage 64.1% → 97.2%, DOMAIN 53.5% → 88.0%, SKILL 53.0% → 63.4%. → commit `eaf46ac`
- `GET /vacancies` silver feed shipped + `apps/web/app/(investigation)/vacancies/` page. Typed fetcher in `lib/api/vacancies.ts`. → commit `0340ecf`, [migration tracker](./migrations/vacancies-api.md)
- `md/engineering/FRONTEND.md` added (Next.js 16 + Server Components, `lib/api/` conventions). → commit `58e96f8`

---

## 2026-05-11

- BAML prompt v2 + token-usage tracking + cost dashboard shipped (`feat/extraction-prompt-v2`). Every `rss_records.extracted_data` carries a `{ _v, _usage }` sidecar. Prompt v2 adds canonical-taxonomy injection (60s cache), UA-market context, anti-fluff rules, few-shot examples. Migrations `0008`/`0009` introduce `extraction_cost` view with per-model pricing. New `GET /extraction-cost/summary` + `/dashboard/extraction` web page. `apps/etl/scripts/reextract-vacancies.ts` for one-shot re-runs after prompt bumps. → [migration tracker](./migrations/_done/extraction-prompt-v2.md), [runbook](../runbook/extraction-cost.md)

---

## 2026-05-09

- Operator dashboard P1+P2+P3 + two polish rounds shipped (`feat/operator-dashboard-p3`, PR #12). Sidebar-driven `(investigation)` layout, `/dashboard` (KPI strip + sparklines + activity stream), `/sources` (per-source health + skill-verified % joined client-side), `/taxonomy` (coverage panel + queue tabs + node drawer). Three SVG primitives (`Sparkline`, `StackedBar`, `Donut`) in `components/data/` — no chart library. `/monitoring` 308-redirected to `/dashboard`. `SeniorityBadge` + `CopyButton` polish in round 2. → [migration tracker](./migrations/_done/operator-dashboard.md)
- Stage 05 closed 2026-05-08; Stage 06 opens with the dashboard as entry surface. → [`roadmap.md`](../roadmap.md)

---

## 2026-05-24

- Taxonomy curation moved to a split-pane workspace (`feat/taxonomy-workspace`). Dashboard-style `/taxonomy` replaced by list-with-always-on-detail: filters + full list left, sticky detail panel right. All filter + selected-node state in `searchParams` for deep-links and history. Backend added `GET /admin/taxonomy/nodes` (CTE-based, pagination, multi-status filter) and `PATCH /admin/taxonomy/nodes/:id/rename` (promotes old canonical to alias; `409` with `suggestion.mergeTargetId` on collision). Legacy `GET /admin/taxonomy/queue` + `NodeDrawer` modal deleted. → [migration tracker](./migrations/_done/taxonomy-workspace.md)

---

## 2026-06-04

- ETL source modules regrouped from flat `src/` into stage folders: `01-ingest/`, `02-enrich/`, `03-discovery/`, `04-notify/`, plus `admin/` and `platform/`. Pure structural move (`git mv` + import fixups); no behaviour change, build green, 201 unit tests pass. Folder map + dependency rules in [overview](../architecture/overview.md#nestjs-layout).

---

## 2026-06-17

- **Tech-vacancy filter shipped** (`feat/tech-filter`, PR #48). Two hard-skip gates: Gate 1 (`passesTechGate`, recall-biased regex at ingest) + Gate 2 (LLM `isTech` at loader, precision-biased). No `is_tech` column; `rss_records` persist so dropped rows stay re-derivable. Gate 1 blacklist scans role **head** (parens stripped) with Unicode-safe word boundaries; `business-develop` added. `scripts/cleanup-nontech.ts` deleted 19 junk prod rows. → [migration tracker](./migrations/_done/tech-filter-implementation.md)
- **Threshold auto-verify removed** (`refactor/skill-verify`). `autoVerifySkills` Temporal schedule deleted; skill verification is now a deliberate operator decision. Mention count survives only as a triage signal in the NEW queue. New policy doc: [taxonomy-verification-policy.md](../runbook/taxonomy-verification-policy.md). Tracker retired to [`_done/`](./migrations/_done/taxonomy-autoverify.md).

---

## 2026-06-25

- **CV skill-recommendations widget shipped** (`feat/cv-skill-recommendations`, PR #55). "Що вчити далі" — marginal-counterfactual unlock list over the role cohort. → ADR-0009, [tracker](./migrations/cv-skill-recommendations.md)
- **Recommendation skill-metadata gates shipped** (`feat/recs-skill-metadata`, PR #56). New `node_tech_meta` table (LLM-classified category/stack/is_core/generic) + `node_skill_cooc` matview (NPMI, refreshed with `node_stats`); BAML `ClassifySkills` + `classify-skills` backfill CLI. Gates drop foreign-stack (F2) + already-known language (F1, TS⇒JS) + substitute frameworks (cooc npmi≥0.30) from "learn next"; redundant footer limited to generic skills. Prod backfilled 1228 rows. IDF/`node_stats` untouched. → ADR-0010, [tracker](./migrations/_done/skill-metadata-recommendations.md)
- **reverse-ATS stack-fit soft-demote** (`feat/reverse-ats-v2-role-fit`). `rankByRefs` sorts `on_stack DESC` first — off-stack vacancies (required core tech outside the candidate's stack-set) sink below in-stack ones (soft, not a filter); web `MatchCard` shows an «інший стек» badge. Fixes cross-stack match leak (e.g. QA/mobile in a backend CV). → [reverse-ats §rev 2026-06-25](./migrations/reverse-ats.md)

---

## 2026-07-01

- **One filter store + shared filter DTO** (`refactor/filters-components`). The feed and reverse-ATS now share one URL-backed filter layer instead of two divergent stores. Backend: a single class-validator `FilterParamsDto` (+ `FeedQueryDto`/`MatchDto`) validates both `GET /feed` (query) and `POST /ranking/match` (body) — the feed dropped its 18 positional `@Query` args, ranking dropped its `unknown`-typed body. The feed gained multi-select seniority/format + english/employment/`postedWithinDays` cold filters (`inArray`). Frontend: one superset `FilterState` + `FiltersApi` (URL-backed via `useUrlFilters`, swappable to a state backend); reverse-ATS moved off local `useState` onto it (filters now bookmarkable, re-rank via a URL-filters effect) and `filter-model.ts` was deleted; one shared `<FilterRail lens>` serves both pages. URL keys went plural (`?seniorities=`…), breaking old singular bookmarks (pre-launch, acceptable). → [tracker](./migrations/filters-components.md)

---

## 2026-07-03

- **Slugs in the URL** (`feat/reverse-ats-candidates`, PR #60 — filters epic T7). Filter URLs read `?roles=backend-engineer` instead of node UUIDs. New `nodes.slug` (minted once, immutable on rename, unique per `(type, slug)`; shared `slugify`/`uniqueSlug` in `libs/database`) — ingest mints a non-colliding slug before insert; a one-time backfill seed (`db:seed:node-slugs`) fills existing rows (`C/C++/C# → c/c-2/c-3`). Facets, track preset, and contextual skills emit the slug as `id`; a single `NodeSlugResolver` maps slugs → ids at the feed/ranking/cv/subscription-create boundary, so all downstream SQL, the stored subscription rows, and the digest replay stay id-based (no jsonb migration; old UUID subs keep matching). Frontend is id-agnostic → no functional change. **Prod:** run migrate + `db:seed:node-slugs` on deploy. → [tracker T7 outcome](./migrations/filters-components.md)

---

## 2026-07-05

- **Feed ⊕ reverse-ATS merged and flipped to the home page** (`feat/merged-cold-lens`, PR #64 — *committed, not yet merged/deployed*). The former `/merged` beta is now the feed at `/`: one page, two lenses — cold (browse by tracks + filters) and warm (`?cv` → CV-ranked list + skill recs). The standalone classic-feed and `/reverse-ats` routes folded in (`/merged`, `/merged/:slug*`, `/reverse-ats` → 307 → `/`); the reverse-ATS widgets were promoted to `features/cv-match/` and the route deleted. Full English public UI (the Clerk-gated `(investigation)` dashboard stays Ukrainian; the `мetahunt` wordmark is intentional). a11y: `LensTabs` is a WAI-ARIA tablist (roving tabindex + arrow keys) wired to a `role=tabpanel`, keyboard-focusable fit/off-stack tooltips, focus-visible rings on the shared `Button`/`IconButton`, and app-wide `prefers-reduced-motion` (durations zeroed + smooth-scroll gated). Security: CV upload is validated by content (`%PDF-` magic + NUL-byte reject) not the client MIME; the `?cv` capability UUID is redacted from PostHog and UUID-validated client-side (malformed → cold, no 500). Legacy "merged" code vocabulary renamed to feed (`FeedLensShell`, `use-feed-*`, `feed:upload-cv`). **Deploy:** web (Vercel) is self-contained; the warm-lens sample profiles + track browse need `db:seed:candidates` + `db:seed:tracks` in prod (and `db:seed:node-slugs` if not already run). No new DB migration. → [tracker](./migrations/feed-reverse-ats-merge.md)

---

## 2026-07-20

- **Extraction outcomes made truthful** (`fix/extraction-outcome-boundary`). RSS records now expose `pending`, `failed`, or `succeeded`; failed attempts remain eligible for RSS retry and cannot enter the Silver loader. Monitoring exposes the explicit status filter and per-ingest counts, while the operator dashboard distinguishes failed extraction from pending work. No migration or data backfill.
- **RSS fetch finalization repaired** (`fix/rss-fetch-finalization`). The ingest workflow now marks an existing ingest as failed by `workflow_run_id` after exhausted fetch/storage retries, rather than leaving it in `running`. No migration or production backfill.
 - **Analytics privacy boundary tightened** (`fix/analytics-privacy-contract`). PostHog no longer receives Telegram chat IDs or full subscription filters; server funnel events use opaque subscription/account IDs, and `digest_sent` carries a deterministic delivery ID. Cross-subscription chat identity remains intentionally unsupported until a consented account identity contract exists.
