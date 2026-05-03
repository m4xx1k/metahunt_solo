# Frontend migration into monorepo + Vercel ✅

**Done:** 2026-05-03 · **Decision:** [ADR-0005](../../decisions/0005-vercel-for-frontend.md) · **Runbook:** [`vercel-deploy.md`](../../../runbook/vercel-deploy.md)

Standalone Next.js client (`maxxik2004/metahunt-client`) imported into this monorepo as `@metahunt/web` at `apps/web/`. Custom domain migrated from the old Vercel project to a new one fed by this repo. Backend Railway deploy untouched.

## What shipped

- `apps/web/` — Next 16.2.3 + React 19.2.4 + Tailwind v4 + shadcn + Phosphor + Radix. Clean copy from the standalone repo (no git history transfer); `landing.pen` moved to `apps/web/design/`.
- New Vercel project from monorepo: `Root Directory = apps/web`, `Install Command = cd ../.. && pnpm install --frozen-lockfile`, `Ignored Build Step` skips commits that don't touch `apps/web/` / `libs/` / root manifests. Custom domain cut over from the old project (~30s downtime, no DNS propagation).
- Backend untouched — Railway `watchPatterns` already excluded `apps/web/**`; Dockerfile copies selectively; `.dockerignore` adds `apps/web` for defense in depth.
- Root `package.json` per-app scripts: `dev:web`, `dev:etl`, `build:web`, `build:all`, `start:web`, `lint:web`. `dev` (parallel) and `build` (etl+database, Railway target) unchanged.
- Old standalone repo `maxxik2004/metahunt-client` archived on GitHub.

## PRs

- #4 — `feat/frontend-migration` (code import + initial docs)
- #5 — `chore/web-scripts-and-vercel-docs` (per-app scripts; runbook rewritten under "new project + domain migration" approach after we moved away from the original "reconnect" plan)
