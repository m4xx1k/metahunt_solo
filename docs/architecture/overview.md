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

- `AppModule` — imports `ConfigModule` + `DatabaseModule`, registers `AppController`.
- `AppController` — health endpoint `GET /`: runs `SELECT 1`, returns `{ status: "ok", db: "up" }`.
- `main.ts` — `NestFactory.create(AppModule)` + `app.listen(PORT)` (PORT from env, default 3000).

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
| `@metahunt/etl` | `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs`, `@metahunt/database`, `drizzle-orm` |

## Runtime and env

- Local DB runs in docker (`pgvector/pgvector:pg16`) on `localhost:54322`.
- `db:migrate` and `db:seed` scripts load env via `dotenv/config`.
- ETL runtime loads root `.env` at process start using `node --env-file-if-exists=../../.env` and then reads configuration through `ConfigService` (`ignoreEnvFile: true` in Nest config).
- In server environments, the same code path works with pure process-level env injection (no file required).

## Current gaps

- No ETL pipelines/workflows yet (only health endpoint + DB ping).
- No lint/format/test/CI pipeline yet.
