# Releases / journal

Chronological log of changes. Don't duplicate git log — write what's useful for onboarding and understanding how the project evolved.

Format: group by date, short bullets inside. If a bullet has bigger context, link to an ADR / docs / PR.

---

## 2026-07-24

- **Operator console rework** (`feat/operator-console`). Every protected screen moved under one `/dashboard/*` subtree (old top-level paths — `/product-analytics`, `/sources`, `/taxonomy`, `/vacancies`, `/unique-vacancies`, `/dashboard/extraction`, `/dashboard/ingests/:id` — are permanent redirects); one layout owns the guard, the sidebar and `<main>`, and each screen is one concern rendered from a shared kit (`ui/layout/{PageHeader,PageBody,Panel}`, `ui/data/{StatCard,StatGrid,StatRows,MeterRow,DataTable}`, `ui/feedback/EmptyState`). Long screens split into URL-backed tabs (`?tab=`) instead of a long scroll; period/population/search do real navigations. `/dashboard` is now a widget grid where every tile and panel drills into the screen that explains it, and the 578-line react-query analytics monolith is a server component plus four panels. New `/dashboard/runs` (with a failed tab) replaces the on-dashboard activity stream and failure drawer. Added real 404s (public + in-console). Frontend only; no backend or product changes. → [tracker](./migrations/_done/operator-console.md)
- **`/match` onboarding landing** (`feat/match-onboarding-page`). New ad-landable stepper page: radar-style hero with live supply counts, then CV → Скіли → Ролі → Винятки, every step skippable. CV upload + skill review (remove / search-add / NPMI suggestions) run on the real `/cv` API; the manual no-CV path collects skill slugs locally and exits into the cold feed's `?skills=` filter, with a real skills-scoped Telegram subscription as the secondary CTA. Roles and excludes steps are functional-looking local mocks (`app/match/_components/_mocks.ts`) pending the role-suggestions/excludes backend PRs (design: `.scratch/cv-match-flow-design.md`). Promotions per the second-consumer rule: `CvSkillManager` → `features/cv-match/` (copy/className slots), `RadarSubscribe` → `features/subscribe/SubscribeCta`.
- **Role suggestions + role hard filter on the warm feed** (`feat/role-suggestions`, design: `.scratch/cv-match-flow-design.md` PR1). `GET /cv/:id/role-suggestions` (+ public sample twin) scores every VERIFIED role by the smoothed share of its last-30d vacancies the candidate covers at GOOD+ — same IDF-weighted coverage CTE the matcher uses, now extracted and shared. Top-5 returned with honest `goodCount/totalCount` numerators, declared CV role pinned first, mean-coverage fallback flagged `reduced` on cold start; smoothing/floor math is a spec-tested pure function (`role-suggestions.derive.ts`). `MatchFilters.roleNodeIds` is a hard role filter (explicit user choice ≠ soft on_stack demote), plumbed as `roleIds` slugs through `/cv/:id/matches`, `POST /ranking/match`, and the warm-lens sidebar (role multiselect, suggestions lead with N/M labels, top-3 preselected once per candidate, `?roles=` URL-synced). rankByRefs additionally emits a personless `match_scored` PostHog event (coverage histogram + tier counts, page-1 sampled) — the §8 threshold-calibration raw data.
- **Bot clicks excluded from apply analytics** (`fix/bot-click-analytics`). The `/go/:id` apply redirect now skips `apply_clicked`/`digest_link_clicked` recording (product_events + PostHog) when the User-Agent is a known crawler or missing (`isbot`); the redirect itself is unaffected. Crawlers were ~95% of recorded clicks (2019 fake clicks/30d), each minting a fresh anonymous PostHog person. Dashboard queries unchanged — the pollution stops at the source.
- **Integration-test hotfix for the role-suggestions merge** ([PR #114](https://github.com/m4xx1k/metahunt_solo/pull/114), `fix/ranking-int-analytics-arg`). The role-suggestions change added a required `AnalyticsService` third constructor arg to `RankingService` but didn't update the two integration specs that construct it directly (`ranking.int.spec.ts`, `candidate-loader.int.spec.ts`) — no textual conflict, so the gap only surfaced as a failing `integration (etl)` job once everything landed on `main` (TS2554). New shared `test/int/analytics.ts` → `noopAnalytics(db)` builds a real `AnalyticsService` with a no-op sink (`matchScored` only calls `posthog.capture`, unasserted here) and is threaded through both call sites.

---

## 2026-07-22

- **First-user funnel deployed** ([PR #93](https://github.com/m4xx1k/metahunt_solo/pull/93), `f71cff8`). Vercel now serves `/radar/backend`, `/privacy`, robots, and sitemap; Railway deployment `0e3e25ef-f8ef-411b-8edc-f098e2b61814` serves the API after migration `0028`. Production smoke checks passed dependency health, public-sample/private-upload isolation, CORS, and anonymous Telegram handoff with zero observed 5xx. The first API candidate failed its health gate before traffic because `AuthService` was not exported to guard-consuming modules; `d5c5b2a` added the export and a consumer-boundary regression test before the successful rollout. Real Telegram E2E and traffic remain gated. → [funnel runbook](../runbook/first-user-funnel.md)
- **Self-service account deletion** (`feat/real-user-funnel`). Authenticated users can permanently remove their Telegram identity, owned and same-chat alerts, notification ledger, CV links, and final-owner derived candidate data from `/me`. Migration `0028` makes subscription and notification cascades explicit; protected requests reload account existence/current roles, Telegram login is limited to ten attempts per IP per minute, and new login analytics no longer identifies the account UUID. Historical pseudonymous provider events remain a separate owner-handled deletion request. → [runbook](../runbook/account-deletion.md)
- **Scheduled-delivery observability** (`feat/real-user-funnel`). `digest_evaluated` distinguishes first/returning and matches/empty runs; `digest_sent` carries the same first-digest/profile dimensions; `digest_delivery_failed` records a bounded permanent/transient class without provider error text. Evaluation and failure IDs deduplicate Temporal retries. → [funnel runbook](../runbook/first-user-funnel.md)
- **Operator page SSR auth fixed** (`fix/operator-cookie-session`). `(investigation)` pages (dashboard, product-analytics, etc.) 401'd on load because their server-rendered data fetches only ever carried the localStorage session token, which never reaches the server. Login/logout now also sync an httpOnly cookie via a new `POST`/`DELETE /api/session` route handler, and `lib/api/client.ts` forwards it as the Bearer header for server-side reads; the client-side localStorage flow is unchanged. `(investigation)/layout.tsx` redirects home when no session cookie exists, and a new `error.tsx` catches a stale/non-admin one instead of an unhandled SSR crash. → [telegram-auth runbook](../runbook/telegram-auth.md#roles--admin)
- **First-party activation ledger and operator dashboard** (`feat/analytics-ledger-dashboard`, [PR #95](https://github.com/m4xx1k/metahunt_solo/pull/95)). Pseudonymous journey IDs now connect critical browser, subscription API, Telegram activation, preview, digest, click, and unsubscribe events in PostgreSQL; critical product mutations atomically enqueue evidence, a retrying dispatcher materializes `product_events`, and PostHog is a secondary sink under the same identity. Migration `0029` safely classifies existing subscriptions as legacy and links known Telegram accounts through concrete subscriptions without fabricating historical events or permanently owning a shared browser journey. The admin-only `/product-analytics` page exposes an ordered seven-day radar funnel, isolated production/test populations, subscription delivery state, identity-integrity gaps, outbox backlog, and recent journeys without Telegram or profile data. Dispatcher/PostHog failures stay outside the main subscription and delivery failure boundary. → [tracker](./migrations/_done/analytics-ledger-dashboard.md)
- **Session summary — 14 PRs (#95–#108), acquisition + measurement + launch hardening.** Grouped by theme:
  - *Analytics ledger and funnel dashboard iterated* (#95, #100, #102, #104). Building on the ledger's initial ship (detailed above), `/product-analytics` gained a per-subscriber activity table (#100), an accessible funnel/subscribers/identity/journeys tab layout with `@username` links and funnel/feed-vs-CV charts (#102), and an ordered-funnel fix: per-step counting replaced a `landing_view`-anchored recursive chain that had silently dropped a journey from every later step once any earlier step was missing (#104). → [tracker](./migrations/_done/analytics-ledger-dashboard.md)
  - *Radar acquisition landings polished* (#96, #98). `/radar/backend` swapped its bare supply count for the 3 most-recent Backend vacancies as concrete proof (#96); the homepage's CV privacy disclosure moved out of the sticky mobile control bar and the sample-profile picker moved into the hero, above the fold (#98).
  - *Digest per-chat dedup and retry-hardening* (#97, #105). A Telegram chat with two overlapping subscriptions no longer receives the same vacancy twice — the anti-duplicate lookup is now chat-scoped, not subscription-scoped (#97). The Temporal send retry widened from 3 attempts/~4s to 5 attempts/~1min, and the Telegram sender now retries transient network errors (`ETIMEDOUT`, `ECONNRESET`, etc.) independently of the existing 429 handling; a blocked-bot 403 still never retries (#105).
  - *Subscriber Telegram identity captured* (#99). `subscriptions` gained nullable `tg_username`/`tg_first_name` (migration `0030`), captured on `/start` and backfilled for existing chats via `pnpm db:backfill:tg-usernames`; digest-send logic untouched.
  - *Feed clicks attributed to a browser journey* (#103, #107). The feed's `/go/:id` apply link now carries the browser's journey id; an unattributed tap records a durable `apply_clicked` product event, kept separate from Telegram digest-click attribution (#103), and surfaces in the dashboard as a per-subscriber `feedClicks` count plus a standalone `feedEngagement` KPI (#107).
  - *Operator cookie-auth* (#101). Detailed above.
  - *Public vacancy page* (#106, #108). `/vacancy/[id]` is now a shareable, indexable page per vacancy with OG/Twitter metadata and a dedup-count hero stat, backed by a new `GET /feed/vacancy/:id` endpoint returning the full description (#106); that description is now sanitized server-side with an allowlist before rendering, fixing raw HTML tags showing up as literal text (#108).

---

## 2026-07-21

- **Ingest launch hardening** (`feat/ingest-pipeline-refactor`). RSS exact-match suppression is source-scoped, production fetch failures follow Temporal retry semantics without fixture fallback, workflow and worker fan-out is bounded, and listing updates are latest-record-wins with race-safe embedding and duplicate-cluster invalidation. No schema migration was required. → [migration tracker](migrations/ingest-pipeline-refactor.md)
- **Anonymous CV demos repaired** (`feat/real-user-funnel`). Seeded sample profiles now use a public sample-only match endpoint; uploaded candidates remain JWT- and owner-protected. The home feed routes sample requests through that endpoint on both server seed and client refetch. → [migration tracker](migrations/real-user-funnel.md)
- **First measurable acquisition path** (`feat/real-user-funnel`). `/radar/backend` turns the existing cold Telegram subscription into a campaign landing with truthful DOU + Djinni proof, explicit intent/create/handoff events, and bounded UTM properties. Public CV/analytics disclosure, honest root metadata, `robots.txt`, and `sitemap.xml` close the immediate trust/discovery gaps. No deployment or ad spend was triggered. → [launch audit](../../METAHUNT_AUDIT_AND_NEXT_STEPS.md)
- **Immediate Telegram activation value** (`feat/real-user-funnel`). A fresh deep-link activation now reuses the read-only 14-day matcher to render up to three attributed vacancies, or an explicit zero state, after confirmation. Preview failures are isolated from the successful link, and `activation_value_shown` measures the step without Telegram identity or filter values. → [migration tracker](migrations/real-user-funnel.md)

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
