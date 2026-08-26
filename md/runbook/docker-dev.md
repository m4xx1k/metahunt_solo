# Runbook — dockerized dev with live watch

## What / why / how

**What.** Run the entire local stack — Postgres, MinIO, Temporal, plus the `etl`
and `web` apps — in Docker, with your source edits reloading live.

**Why.** No local Node/Postgres/Temporal/MinIO setup to maintain, parity with how
the services actually run, and one command to bring everything up. Edits are
picked up automatically; you don't restart anything by hand.

**How.** Infra once, then the app stack — pick by which app you are editing:

```bash
pnpm docker:infra      # shared infra only (also for running the apps natively)
pnpm docker:up         # infra + etl + web, detached. web is live; etl is not.
pnpm docker:dev        # same, but foreground with `docker compose watch` → etl live too
pnpm docker:dev:down   # stop the app containers (infra stays up)
pnpm docker:infra:down # stop infra
```

Both bring infra up first (it creates the `metahunt-infra` network the apps
join). **`docker:up` is the one you want for frontend work**: web's source is
bind-mounted, so Next sees your edits with no helper process and the stack
survives a closed terminal. Reach for `docker:dev` only when you are editing
`apps/etl` or `libs/database` — etl needs a container restart per change and only
the watcher can do that. Ctrl-C stops watching (the containers keep running).

> **Why `restart: "no"` on etl and web.** `docker compose watch` is a foreground
> process that dies with its terminal. These two used to carry
> `restart: unless-stopped`, so a reboot brought them back *without* the watcher —
> etl then served whatever code was baked into the image, silently, with nothing
> in the logs to say so. A dev container being up now means someone started it
> this session.

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
  - **web** bind-mounts `./apps/web` → Next.js Fast Refresh handles edits
    in-process, with no watcher to keep alive and no way to end up running stale
    code. Two anonymous volumes mask `node_modules` and `.next` so the image's
    own install and build cache win: the host's `apps/web/node_modules` is a
    symlink farm into the host store (the whole workspace, not web's subset), and
    a shared `.next` would collide with native `pnpm dev:web`. The image creates
    `.next` itself — the sidecar ignore file drops it from the build context, and
    an anonymous volume seeded from nothing lands root-owned, which `next dev`
    (running as `node`) cannot write to.
  - **etl** uses `develop.watch: sync+restart` → a clean **container restart** on
    any `apps/etl` or `libs/database` change. etl is a stateful poller (Telegram
    long-poll + Temporal worker) holding port 3333; an in-container `nest --watch`
    orphaned its process under a shell wrapper (old process kept the port →
    `EADDRINUSE`), so it instead builds once and `exec`s node, and Compose does the
    restart. `init: true` (tini) makes that stop fast and clean.
  - A dependency change (`pnpm-lock.yaml`) triggers `rebuild` (re-bakes the image).
- **web waits for etl to be healthy, not just to exist.** etl builds on boot
  (~20–40s); `depends_on: - etl` only waited for the container to start, so the
  first page load raced it and 500'd on `ECONNREFUSED` with nothing in the UI to
  explain it. etl now has a healthcheck and web gates on
  `condition: service_healthy`. The probe is `GET /` (process up + `SELECT 1`),
  **not** `/healthz`: the latter also requires Temporal and object storage, so a
  slow Temporal would abort `docker compose up` and the frontend would never
  start. It shells out to `node -e "fetch(...)"` because `node:22-slim` ships
  neither curl nor wget.
- **Both `docker:` scripts pass `-V` (`--renew-anon-volumes`).** Compose reuses
  anonymous volumes across a container recreate, so after a dependency change the
  stale `node_modules` volume would mask the freshly installed one and `next dev`
  would die on `Module not found`. `-V` re-seeds both masks from the image every
  time; the cost is a cold `.next` cache on each `up`.
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
