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
- prod healthcheck path is `/healthz` — see [`/docs/runbook/railway-deploy.md`](../../docs/runbook/railway-deploy.md) for the full env-var matrix (Temporal Cloud + S3/R2)

## Docs

Engineering docs live at the repo root in `/docs/`. See [`/docs/architecture/overview.md`](../../docs/architecture/overview.md) for how this app fits into the monorepo, and [`/docs/journal/decisions/0002-etl-http-server.md`](../../docs/journal/decisions/0002-etl-http-server.md) for why this is an HTTP server rather than a headless process.
