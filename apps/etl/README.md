# @metahunt/etl

NestJS HTTP application — the process entry point of metahunt. Currently a minimal scaffold; real ETL jobs land in Stage 04 (see roadmap).

## Run

From the repo root:

```bash
pnpm --filter @metahunt/etl build
pnpm --filter @metahunt/etl start         # node dist/main.js
pnpm --filter @metahunt/etl start:dev     # nest start --watch
```

Or use the root shortcuts: `pnpm build`, `pnpm start`, `pnpm dev`.

## Public surface

| Method | Path | Status | Returns |
|---|---|---|---|
| GET | `/` | 200 | `{ "status": "ok", "db": "up" }` — Postgres canary; legacy entrypoint. |
| GET | `/healthz` | 200 / 503 | Aggregated health: Postgres + S3 + Temporal. 503 with per-dependency `{ ok, error }` when any fails. |
| GET | `/rss` | 202 | `{ "triggered": "all" }` — fire-and-forget; starts one `rssIngestWorkflow` per source on the configured Temporal task queue. |

Listens on `process.env.PORT`, default `3000`.

Railway notes:
- deploy config comes from root `Dockerfile` + `railway.json`
- pre-deploy migration runs via `ts-node`
- runtime image includes workspace `node_modules` required by migration and app startup
- prod healthcheck path is `/healthz` — see [`/md/runbook/railway-deploy.md`](../../md/runbook/railway-deploy.md) for the full env-var matrix (Temporal Cloud + S3/R2)

## Extraction providers

Vacancy extraction is hidden behind the `VACANCY_EXTRACTOR` token. The provider is picked at boot from `EXTRACTOR_PROVIDER`:

| Provider | Lives in | When to use |
|---|---|---|
| `placeholder` | `src/extraction/placeholder.extractor.ts` | Default. Returns a static shape, no LLM call. CI / local without a key. |
| `baml` | `src/baml-extraction/baml.extractor.ts` (+ `baml_src/`) | BAML-typed client over OpenAI. Schema, prompt, and per-field instructions all live in `baml_src/extract-vacancy.baml`. The TS type `ExtractedVacancy` is generated from the same file into `src/baml_client/`. → ADR-0004 |

`OPENAI_API_KEY` is required for `baml`. After editing any `.baml` file under `apps/etl/baml_src/`, regenerate the TS client:

```bash
pnpm --filter @metahunt/etl baml:generate
pnpm --filter @metahunt/etl baml:check       # semantic check, no codegen
```

The generated client lands in `apps/etl/src/baml_client/` and is committed (so `nest build` works without an extra codegen step in Docker).

### Iterating on the prompt

`baml_src/extract-vacancy.baml` declares two `test` blocks for `baml-cli test` (one synthetic, one real DOU.ua RSS item):

| Test | Purpose |
|---|---|
| `senior_backend_remote` | Tiny synthetic posting; fast smoke for prompt regressions. |
| `dou_fullstack_talanovyti` | Real RSS item captured 2026-04-24. Same shape (`Title: …\n\n<description>`) that `RssExtractActivity` feeds the extractor. Re-exported as a TS fixture from [`src/baml-extraction/__fixtures__/dou-fullstack-talanovyti.ts`](src/baml-extraction/__fixtures__/dou-fullstack-talanovyti.ts) so unit tests and BAML share one source. |

Run them:

```bash
cd apps/etl
OPENAI_API_KEY=sk-... ./node_modules/.bin/baml-cli test --from baml_src
# single test:
OPENAI_API_KEY=sk-... ./node_modules/.bin/baml-cli test --from baml_src --filter dou_fullstack_talanovyti
```

The BAML VS Code extension also exposes "▶ Run test" inline above each `test` block.

## Docs

Engineering docs live at the repo root in `/md/`. See [`/md/architecture/overview.md`](../../md/architecture/overview.md) for how this app fits into the monorepo, and [`/md/journal/decisions/0002-etl-http-server.md`](../../md/journal/decisions/0002-etl-http-server.md) for why this is an HTTP server rather than a headless process.
