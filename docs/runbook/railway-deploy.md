# Railway deploy (Docker + config as code)

This runbook describes the production deploy path for this repository on Railway.

## Source of truth

- `Dockerfile` at repo root — build/runtime image definition.
- `railway.json` at repo root — deployment settings for Railway.

## Current deploy contract

- Builder: `DOCKERFILE`
- Watch patterns: `Dockerfile`, `railway.json`, `package.json`, `pnpm-lock.yaml`, `apps/etl/**`, `libs/**`
- Pre-deploy: `node -r ts-node/register/transpile-only libs/database/migrate.ts`
- Start: `node apps/etl/dist/main.js`
- Healthcheck: `GET /`
- Runtime port: `process.env.PORT` (fallback `3000` in app code)
- Source repo/branch: `m4xx1k/metahunt_solo` / `main`

## Required Railway variables

- `DATABASE_URL` — Postgres connection string.
- `NODE_ENV=production`

Optional:
- `PORT` — Railway usually injects this automatically.

Recommended:
- Store `DATABASE_URL` in ETL as a Railway reference to Postgres service variable:
  - `DATABASE_URL=${{Postgres.DATABASE_URL}}`

## First-time setup

1. Push repository with root `Dockerfile` and `railway.json`.
2. In Railway, create a project from the GitHub repository.
3. Add Postgres service in the same project.
4. Add required variables (`DATABASE_URL`, `NODE_ENV`) to `@metahunt/etl`.
5. Trigger deployment and verify logs:
   - image build completes
   - pre-deploy migrations complete
   - app starts and listens on provided `PORT`

## CLI flow (project `intelligent-harmony`)

Use proxy if needed:

```bash
export HTTP_PROXY=http://127.0.0.1:3128
export HTTPS_PROXY=http://127.0.0.1:3128
```

Link and inspect:

```bash
railway link -p intelligent-harmony
railway status --json
railway service list
```

Provision Postgres and wire ETL vars:

```bash
railway add --database postgres --service postgres
railway variable set --service @metahunt/etl --environment production NODE_ENV=production DATABASE_URL='${{Postgres.DATABASE_URL}}'
```

Deploy from current code (new snapshot):

```bash
railway up --service @metahunt/etl --environment production
```

Inspect deployments/logs:

```bash
railway deployment list --service @metahunt/etl --environment production --json
railway logs --build --latest --lines 200
railway logs --deployment <DEPLOYMENT_ID> --lines 200
```

## Deploy semantics that matter

- `railway redeploy` reruns the latest deployment snapshot. It does **not** guarantee pulling the newest git commit.
- To deploy new code, use:
  - Railway UI: **Deploy latest commit**
  - CLI: `railway up`

## Watch patterns risk

Current service has `watchPatterns: ["/apps/etl/**"]`.
This can skip deployments for root-level infra changes (`Dockerfile`, `railway.json`, lockfile).

If you keep watch patterns enabled, include at least:
- `Dockerfile`
- `railway.json`
- `package.json`
- `pnpm-lock.yaml`
- `libs/**`
- `apps/etl/**`

## Redeploy checklist

1. Confirm new migrations exist in `libs/database/migrations` when schema changed.
2. Ensure ETL has `DATABASE_URL` + `NODE_ENV=production`.
3. Deploy latest commit (`railway up` or UI button).
4. Check pre-deploy output for successful migration run.
5. Verify health endpoint (`GET /`) responds successfully.
