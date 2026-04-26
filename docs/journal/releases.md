# Releases / journal

Chronological log of changes. Don't duplicate git log — write what's useful for onboarding and understanding how the project evolved.

Format: group by date, short bullets inside. If a bullet has bigger context, link to an ADR / docs / PR.

---

## 2026-04-26

- Monorepo scaffold on pnpm workspaces. `apps/etl` (`@metahunt/etl`) + `libs/database` (`@metahunt/database`, a `@Global()` Nest module with a placeholder constant). The old `_metahunt/` (NestJS CLI monorepo) is archived as a read-only reference. → ADR-0001
- `apps/etl` switched from headless `createApplicationContext` to a full HTTP server via `@nestjs/platform-express`. `GET /` returns `{ greeting }` from the lib — a canary check that DI across workspaces works. → ADR-0002
- Added dev scripts: `pnpm dev` at the root (parallel `tsc -w` in the lib + `nest start --watch` in the app), plus `start:prod` and `start:debug`.
- Set up engineering documentation (`docs/`) using Snapshot + Journal layout.
- Added package-level `README.md` for `@metahunt/etl` and `@metahunt/database` as front doors (what the package is, public surface, run/build commands). Documented the rule in `docs/README.md`: packages do not get their own `docs/` folders; everything stays centralized at the repo root until a package outgrows that.
- Migrated `@metahunt/database` from placeholder token to real Drizzle + Postgres provider (`DRIZZLE`), with schema for `sources`, `rss_ingests`, `rss_records`, migrations, and seeds.
- ETL health endpoint now verifies DB connectivity (`SELECT 1`) and returns `{ "status": "ok", "db": "up" }`.
- Unified local/server env behavior for ETL startup: process-level env is primary; local root `.env` is loaded via `node --env-file-if-exists=../../.env`.
- Removed migration drift artifact `0004_purple_exodus` and documented migration hygiene: schema changes must be generated with synced `migrations/meta/*`.
- Added Railway deployment IaC for the pnpm workspace setup: root `Dockerfile` (multi-stage build on Node 22) and `railway.json` with `DOCKERFILE` builder, pre-deploy migrations, and explicit start command.
- Added root `.dockerignore` to keep deployment context clean and deterministic.
- Added first runbook entry for production deploy flow and required Railway variables. → `docs/runbook/railway-deploy.md`
