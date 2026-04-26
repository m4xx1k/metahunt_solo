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

| Method | Path | Returns |
|---|---|---|
| GET | `/` | `{ "status": "ok", "db": "up" }` |

Listens on `process.env.PORT`, default `3000`.

Railway notes:
- deploy config comes from root `Dockerfile` + `railway.json`
- pre-deploy migration runs via `ts-node`
- runtime image includes workspace `node_modules` required by migration and app startup

## Docs

Engineering docs live at the repo root in `/docs/`. See [`/docs/architecture/overview.md`](../../docs/architecture/overview.md) for how this app fits into the monorepo, and [`/docs/journal/decisions/0002-etl-http-server.md`](../../docs/journal/decisions/0002-etl-http-server.md) for why this is an HTTP server rather than a headless process.
