# Railway deploy (Docker + config as code)

This runbook describes the production deploy path for this repository on Railway.

## Source of truth

- `Dockerfile` at repo root — build/runtime image definition.
- `railway.json` at repo root — deployment settings for Railway.

## Current deploy contract

- Builder: `DOCKERFILE`
- Pre-deploy: `node -r ts-node/register/transpile-only libs/database/migrate.ts`
- Start: `node apps/etl/dist/main.js`
- Runtime port: `process.env.PORT` (fallback `3000` in app code)

## Required Railway variables

- `DATABASE_URL` — Postgres connection string.
- `NODE_ENV=production`

Optional:
- `PORT` — Railway usually injects this automatically.

## First-time setup

1. Push repository with root `Dockerfile` and `railway.json`.
2. In Railway, create a project from the GitHub repository.
3. Add required variables (`DATABASE_URL`, `NODE_ENV`).
4. Trigger deployment and verify logs:
   - image build completes
   - pre-deploy migrations complete
   - app starts and listens on provided `PORT`

## Redeploy checklist

1. Confirm new migrations exist in `libs/database/migrations` when schema changed.
2. Deploy.
3. Check pre-deploy output for successful migration run.
4. Verify health endpoint (`GET /`) responds successfully.
