# Skill: Deploy to Railway

**Use when:** deploying metahunt ETL to Railway (Docker + Temporal Cloud + R2/S3 + Postgres).

## Source of truth

Edit only these — Railway UI is read-only mirror.

- `Dockerfile` — image
- `railway.json` — deploy settings (builder, watchPatterns, pre-deploy, start, healthcheck)

## Deploy contract

| Setting | Value |
|---|---|
| Builder | `DOCKERFILE` |
| Pre-deploy | `node -r ts-node/register/transpile-only libs/database/migrate.ts` |
| Start | `node apps/etl/dist/main.js` |
| Healthcheck | `GET /healthz` (Postgres + S3 + Temporal; 200 / 503) |
| Port | `process.env.PORT` (3000 fallback) |
| Watch | `Dockerfile`, `railway.json`, `package.json`, `pnpm-lock.yaml`, `apps/etl/**`, `libs/**` |

## Required env vars

**Postgres** — `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`.

**Temporal Cloud** — `TEMPORAL_ADDRESS=<ns>.<acct>.tmprl.cloud:7233`, `TEMPORAL_NAMESPACE=<ns>.<acct>`, `TEMPORAL_API_KEY=<key>`, `TEMPORAL_TASK_QUEUE=rss-ingest`. App auto-enables TLS when `TEMPORAL_API_KEY` is set; empty → plaintext (local only).

**S3 / R2** — `STORAGE_ENDPOINT`, `STORAGE_REGION` (R2: `auto`), `STORAGE_BUCKET` (must exist), `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`. Bucket perms: `PutObject`, `GetObject`, `HeadBucket`.

**Optional** — `PORT` (Railway injects), `LLM_EXTRACTION_ENABLED=false` for v1.

## Decide: `up` vs `redeploy`

- New code or env change → `railway up` (or UI **Deploy latest commit**).
- Replay last snapshot only → `railway redeploy`. **Does NOT pull new commits.**

## Deploy

```bash
# Proxy if needed
export HTTP_PROXY=http://127.0.0.1:3128 HTTPS_PROXY=http://127.0.0.1:3128

# Link
railway link -p intelligent-harmony
railway status --json

# Deploy
railway up --service @metahunt/etl --environment production

# Watch
railway logs --build --latest --lines 200
railway logs --deployment <ID> --lines 200
```

## Success criteria — all must hold

1. Build completes.
2. Pre-deploy migration: schema applied, no errors in log.
3. Boot logs include: `Worker connection established to <addr>`, `Worker state changed RUNNING`, `Mapped {/healthz, GET}`.
4. `curl https://<domain>/healthz` → 200 with `checks.{postgres,storage,temporal}.ok = true`.
5. Smoke: `curl https://<domain>/rss` → 202; Temporal UI shows `rssIngestWorkflow` runs reaching `Completed`.

## First-time project setup (skip if project exists)

1. Push repo with `Dockerfile` + `railway.json`.
2. Railway: new project from GitHub.
3. Add Postgres service in same project.
4. Provision Temporal Cloud namespace + API key.
5. Provision R2 bucket + scoped token (or S3 bucket + IAM key).
6. Set all env vars on `@metahunt/etl`.
7. Deploy and verify success criteria.

## Rules

1. `railway.json` is the source of truth — don't tune prod-only in UI without committing back.
2. New code → `railway up`, never `redeploy`.
3. Keep `watchPatterns` aligned with the watch list above.
4. `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` reference, never a copy-pasted connection string.
5. Schema changes → pre-deploy migration must succeed before rollout is green.
