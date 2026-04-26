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
- Initialized a fresh git repository in `~/plan-a/metahunt`, created the root commit, and aligned local commit author with `m4xx1k` identity.
- Configured git remote to `git@github-m4xx1k:m4xx1k/metahunt_solo.git`, pinned repo-level SSH command to `~/.ssh/id_m4xx1k`, and pushed `main`.
- Fixed Railway Docker build failure (`tsc: not found`) by forcing recursive workspace install with dev dependencies in Docker (`pnpm install -r --frozen-lockfile --prod=false`) so package-level build tools are available during image build.
- Hardened Docker build flow for Railway by running recursive workspace install in the `build` stage (after full source copy) and copying `node_modules` from `build` to `runtime`, so workspace binaries (`tsc`) resolve reliably during CI builds.
- Fixed Railway pre-deploy migration runtime error by copying `tsconfig.base.json` into the runtime image, required by `ts-node` during `libs/database/migrate.ts`.
- Fixed runtime module resolution for pre-deploy migration by copying workspace `node_modules` for `libs/database` (and app workspace deps for `apps/etl`) into the runtime image.
- Added operational Railway runbook details: CLI flow for `intelligent-harmony`, Postgres wiring via Railway variable reference, deploy vs redeploy semantics, and watch-pattern caveats for root infra files.
- Enforced Railway `watchPatterns` via `railway.json` to include root infra files (`Dockerfile`, `railway.json`, lockfile, package manifest) plus `apps/etl/**` and `libs/**`, preventing skipped deployments on infra-only commits.
- Added Railway healthcheck path (`/`) in `railway.json` so deployment health validation tracks the ETL HTTP endpoint explicitly.
- Tightened docs for day-to-day usage: Railway runbook now has explicit operational rules, and roadmap moved Stage 03 (env/config + deploy baseline) to done with Stage 04 as current focus.
