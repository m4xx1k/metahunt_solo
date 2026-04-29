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
- Healthcheck: `GET /healthz` (Postgres + S3 + Temporal aggregated; 200 ok / 503 degraded)
- Runtime port: `process.env.PORT` (fallback `3000` in app code)
- Source repo/branch: `m4xx1k/metahunt_solo` / `main`

## Required Railway variables

**Postgres**
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` — Railway reference to the Postgres plugin.
- `NODE_ENV=production`

**Temporal Cloud (API-key mode)** — required because `RssModule` boots a worker on startup. Without these the app crashes on connect.
- `TEMPORAL_ADDRESS=<namespace>.<account-id>.tmprl.cloud:7233`
- `TEMPORAL_NAMESPACE=<namespace>.<account-id>`
- `TEMPORAL_API_KEY=<key>` — when set, the app enables `tls: true` + API-key auth automatically (see `apps/etl/src/rss/rss.module.ts`). Leaving it empty falls back to plaintext (local-dev only).
- `TEMPORAL_TASK_QUEUE=rss-ingest` (default; explicit is fine)

**S3-compatible object storage** — required because `RssFetchActivity` uploads raw RSS XML on every run. Cloudflare R2 or AWS S3 both work.
- `STORAGE_ENDPOINT` — for R2 use `https://<account-id>.r2.cloudflarestorage.com`; for AWS S3 leave default per-region URL (`https://s3.<region>.amazonaws.com`).
- `STORAGE_REGION` — R2: `auto`. AWS S3: real region (e.g. `eu-central-1`).
- `STORAGE_BUCKET=<bucket-name>` — must exist; pre-create in the provider's UI or CLI.
- `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` — R2 token credentials, or AWS IAM access key with `s3:PutObject`/`GetObject`/`HeadBucket` on the bucket.

Optional:
- `PORT` — Railway usually injects this automatically.
- `LLM_EXTRACTION_ENABLED` — leave unset / `false` for v1 deploy (placeholder extractor runs; no OpenAI calls). Set `true` + `OPENAI_API_KEY` to enable real LLM extraction later.

## First-time setup

1. Push repository with root `Dockerfile` and `railway.json`.
2. In Railway, create a project from the GitHub repository.
3. Add Postgres service in the same project.
4. Provision Temporal Cloud namespace + API key (https://cloud.temporal.io). Note the address (`<ns>.<acc>.tmprl.cloud:7233`) and namespace (`<ns>.<acc>`).
5. Provision an S3-compatible bucket (Cloudflare R2 recommended for cost: 10 GB free). Create the bucket and an R2 API token scoped to it.
6. Add all variables from "Required Railway variables" above to `@metahunt/etl`.
7. Trigger deployment and verify logs:
   - image build completes
   - pre-deploy migrations complete
   - app starts: `Worker connection established to <temporal-cloud-address>`, `Worker state changed RUNNING`, `Mapped {/healthz, GET}`
   - `GET /healthz` → 200 with all three checks `ok: true`

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

## Operational rules

1. Source of truth for deploy settings is `railway.json` (do not hand-tune prod settings in UI and forget to codify them).
2. New code/config rollout is `railway up` (or UI **Deploy latest commit**), not `redeploy`.
3. Keep `watchPatterns` in sync with infra files:
   - `Dockerfile`, `railway.json`, `package.json`, `pnpm-lock.yaml`, `apps/etl/**`, `libs/**`
4. Keep ETL connected to Railway Postgres via variable reference:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
5. Treat pre-deploy migration as required for schema changes; verify logs before considering rollout complete.

## Redeploy checklist

1. Confirm new migrations exist in `libs/database/migrations` when schema changed.
2. Ensure ETL has all variables from "Required Railway variables".
3. Deploy latest commit (`railway up` or UI button).
4. Check pre-deploy output for successful migration run.
5. Verify health endpoint: `curl https://<railway-domain>/healthz` → 200 with `checks.{postgres,storage,temporal}.ok = true`.
6. Smoke the pipeline: `curl https://<railway-domain>/rss` → 202; in Temporal Cloud UI, check the `default`/configured namespace for `rssIngestWorkflow` executions completing with status `Completed`.
