# Runbook — dockerized dev with live watch

## What / why / how

**What.** Run the entire local stack — Postgres, MinIO, Temporal, plus the `etl`
and `web` apps — in Docker, with your source edits reloading live.

**Why.** No local Node/Postgres/Temporal/MinIO setup to maintain, parity with how
the services actually run, and one command to bring everything up. Edits are
picked up automatically; you don't restart anything by hand.

**How.** Two commands (infra once, then the app stack):

```bash
pnpm docker:infra      # shared infra only (also for running the apps natively)
pnpm docker:dev        # infra (detached) + etl + web with live reload (foreground)
pnpm docker:dev:down   # stop the app containers (infra stays up)
pnpm docker:infra:down # stop infra
```

`docker:dev` brings infra up first (it creates the `metahunt-infra` network the
apps join), then runs `docker compose watch` — which builds the images if needed,
starts `etl` + `web`, and streams your edits in. Ctrl-C stops watching.

Ports (host): web `4000`, etl `3333`, Postgres `54323`, MinIO `9000`/`9001`,
Temporal `7233`, Temporal UI `8080`.

Built on [Docker Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/);
the `develop.watch` / `init` keys are in the
[Compose file reference](https://docs.docker.com/reference/compose-file/).

## Layout

| File | What |
|---|---|
| `compose.infra.yaml` | shared infra: `db` (pg18), `minio`, `minio-init`, `temporal`, `temporal-ui`. Creates the external network `metahunt-infra`. |
| `compose.yaml` | app stack: `etl` + `web`, joined to `metahunt-infra`. `docker compose` finds it by default. |
| `apps/etl/Dockerfile.dev` | etl image: etl + `@metahunt/database` deps baked and the lib built, non-root `node`. Uses the repo-root `.dockerignore` (already excludes apps/web). |
| `apps/web/Dockerfile.dev` (+ `.dockerignore` sidecar) | web image: only web's deps (next/react), non-root `node`. Sidecar keeps apps/web, drops apps/etl + libs. |

## How it works

- **Two lean, non-root images.** Each app has its own `Dockerfile.dev` that bakes
  only that app's deps at build time (web is standalone; etl also builds
  `@metahunt/database`). Both build from the repo root (the pnpm workspace) and
  run as the `node` user, so nothing they write lands root-owned on the host.
- **Reload differs per app, by design:**
  - **web** uses `develop.watch: sync` → the edited file is copied into the
    container and Next.js Fast Refresh handles it in-process (fast, no restart).
  - **etl** uses `develop.watch: sync+restart` → a clean **container restart** on
    any `apps/etl` or `libs/database` change. etl is a stateful poller (Telegram
    long-poll + Temporal worker) holding port 3333; an in-container `nest --watch`
    orphaned its process under a shell wrapper (old process kept the port →
    `EADDRINUSE`), so it instead builds once and `exec`s node, and Compose does the
    restart. `init: true` (tini) makes that stop fast and clean.
  - A dependency change (`pnpm-lock.yaml`) triggers `rebuild` (re-bakes the image).
- **etl → infra by service name.** `DATABASE_URL` → `db:5432`, `TEMPORAL_ADDRESS`
  → `temporal:7233`, `STORAGE_ENDPOINT` → `http://minio:9000`. `NODE_ENV=development`
  (not `local`, which would pin Temporal to `localhost:7233`) + empty
  `TEMPORAL_API_KEY` = plaintext to the compose Temporal.
- **web → etl, two URLs.** `lib/api/client.ts` `apiBase()` uses `API_INTERNAL_URL`
  (`http://etl:3333`) for in-container SSR and `NEXT_PUBLIC_API_URL`
  (`http://localhost:3333`) for the browser. Native dev sets neither → unchanged.
- **Telegram bot is reload-safe.** On a restart the new poller briefly overlaps
  the old, so Telegram 409s one of them. `TelegramService` treats a 409 as "a
  newer instance took over" and stops quietly instead of crashing (also hardens
  prod redeploys); transient network errors retry.

## Database (pg17 → pg18)

The dev data (a prod restore) lives in the external volume
`metahunt_railway_pgdata` (pg18). Infra `db` reuses it as-is:
`PGDATA=/var/lib/postgresql/18/docker`, mounted at `/var/lib/postgresql`, on
`54323`, db `metahunt_railway`. `external: true` → **no dump/restore, no
migration**. `restart: unless-stopped` so it survives reboots.

One-time cutover from the old hand-run container:

```bash
docker rm -f metahunt-railway-db   # stopped manual pg18 container; frees 54323 + the volume
pnpm docker:infra                   # infra db adopts the same volume
```

**Password.** The prod-restore cluster's `pg_hba.conf` trusts localhost but
requires the real password (scram) for other containers, so `POSTGRES_PASSWORD`
in `.env` must equal the password in `DATABASE_URL`. compose interpolates it into
the infra db, Temporal's `POSTGRES_PWD`, and the etl container's `DATABASE_URL`.

**Temporal schemas.** The prod-restore cluster has no `temporal` /
`temporal_visibility` databases; `temporalio/auto-setup` creates them on first
`docker:infra` (metahunt is superuser). They coexist with app data by design.

## Notes

- **Why bridge, not `--network host`:** on Docker Desktop a host-networked
  container's ports aren't reachable from the host, so the browser couldn't hit
  etl/web. Published ports on the bridge work.
- The production image is unchanged: `Dockerfile` (etl multi-stage, Railway) and
  the root `.dockerignore` (which excludes `apps/web`) are separate from these
  dev files.
