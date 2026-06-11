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

**Logging** — `BAML_LOG=OFF` in prod. Defaults (INFO/WARN) dump the full prompt + raw LLM response on every call/error, which torches Railway's log quota fast. The extractor wrapper still re-throws a one-line error so Temporal logs the failure reason; flip to `DEBUG` locally if you need prompt drift visibility.

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

## Day-2 ops

Everyday operations against the running prod service. Link first:
`railway link -p intelligent-harmony`.

**Env vars**

```bash
railway variables --service @metahunt/etl                  # list
railway variables --service @metahunt/etl --set KEY=value  # set → triggers redeploy
```

**Prod Postgres** (read-only analysis, taxonomy review, audits)

```bash
railway connect Postgres                  # interactive psql through the proxy
# or grab the URL for one-off psql/scripts:
railway variables --service Postgres --json | jq -r '.DATABASE_PUBLIC_URL'
```

Rule of thumb: SELECTs freely; writes only through migrations or the admin
API (`/admin/taxonomy/...`) — see `.claude/skills/taxonomy-review/SKILL.md`.

**Temporal schedules** (rss-ingest-hourly, dedup-sweep, taxonomy-autoverify)

Temporal Cloud UI → Schedules → pick one → **Trigger** fires it immediately
(e.g. first taxonomy-autoverify pass right after a deploy instead of waiting
24h). Pause/unpause lives in the same place. Schedules self-install/update on
app bootstrap — changing cadence is a code change, not a UI change.

**Logs**

```bash
railway logs --service @metahunt/etl --lines 200       # runtime
railway logs --build --latest --lines 200              # build
```

## Rules

1. `railway.json` is the source of truth — don't tune prod-only in UI without committing back.
2. New code → `railway up`, never `redeploy`.
3. Keep `watchPatterns` aligned with the watch list above.
4. `DATABASE_URL` uses `${{Postgres.DATABASE_URL}}` reference, never a copy-pasted connection string.
5. Schema changes → pre-deploy migration must succeed before rollout is green.
