# Runbook — dockerized dev with live watch

Run the whole stack in Docker with hot-reload. Both apps watch natively
(`nest --watch`, `next dev`); `docker compose watch` syncs host edits into the
containers and rebuilds on dependency changes. Modelled on beana-ai's setup
(shared infra on an external network, a baked dev image, non-root containers),
upgraded to Compose Watch — the current best practice for Docker Desktop, which
avoids bind-mount permission/perf quirks (no root-owned files on the host, no
polling).

## Layout

| File | What |
|---|---|
| `compose.infra.yaml` | shared infra: `db` (pg18), `minio`, `minio-init`, `temporal`, `temporal-ui`. Creates the external network `metahunt-infra`. |
| `compose.yaml` | app stack: `etl` + `web`, one dev image, joins `metahunt-infra`. `docker compose` finds it by default. |
| `apps/etl/Dockerfile.dev` | etl image: etl + `@metahunt/database` deps baked and the lib built, non-root `node`. Uses the repo-root `.dockerignore` (already excludes apps/web). |
| `apps/web/Dockerfile.dev` (+ `.dockerignore` sidecar) | web image: only web's deps (next/react), non-root `node`. Sidecar keeps apps/web and drops apps/etl + libs. |

## Commands

```bash
pnpm db:up          # infra only (also for running apps natively)
pnpm dev:docker     # infra (detached) + `docker compose watch` (etl + web, foreground)
pnpm dev:docker:down  # stop the app containers (infra stays up)
pnpm db:down        # stop infra
```

Order matters: infra creates the `metahunt-infra` network the apps join, so it
comes up first (`dev:docker` does this for you). `docker compose watch` builds
the image if needed, starts etl + web, then syncs your edits live.

Ports (host): web `4000`, etl `3333`, Postgres `54323`, MinIO `9000`/`9001`,
Temporal `7233`, Temporal UI `8080`.

## How it works

- **Two lean baked images.** Each app has its own `Dockerfile.dev` that installs
  only that app's deps at build time (web is standalone; etl also builds
  `@metahunt/database`). Both build from the repo root (the pnpm workspace).
- **Compose Watch, not bind mounts.** Each service's `develop.watch` `sync`
  copies changed source into the container (one-way, host → container), so the
  in-container `nest`/`next` watchers recompile — no bind mount, no polling, and
  nothing written back to the host. `rebuild` on `pnpm-lock.yaml` re-bakes the
  image when dependencies change. `node_modules` stay the image's copy (ignored
  by sync).
- **Non-root.** The image runs as `node`, so nothing lands root-owned anywhere.
- **etl → infra by service name.** `DATABASE_URL` → `db:5432`, `TEMPORAL_ADDRESS`
  → `temporal:7233`, `STORAGE_ENDPOINT` → `http://minio:9000`. `NODE_ENV=development`
  (not `local`, which would pin Temporal to `localhost:7233`) + empty
  `TEMPORAL_API_KEY` = plaintext to the compose Temporal.
- **web → etl, two URLs.** `lib/api/client.ts` `apiBase()` uses `API_INTERNAL_URL`
  (`http://etl:3333`) for in-container SSR and `NEXT_PUBLIC_API_URL`
  (`http://localhost:3333`) for the browser. Native dev sets neither → unchanged.

**Dependency or `libs/database` changes** aren't hot-synced — bump
`pnpm-lock.yaml` (a dep change) triggers an automatic `rebuild`; for a
`libs/database` source edit run `docker compose up --build` (native `pnpm dev`
has the same one-shot-lib-build behaviour).

## Database (pg17 → pg18)

The dev data (a prod restore) lives in the external volume
`metahunt_railway_pgdata` (pg18). Infra `db` reuses it as-is:
`PGDATA=/var/lib/postgresql/18/docker`, mounted at `/var/lib/postgresql`, on
`54323`, db `metahunt_railway`. `external: true` → **no dump/restore, no
migration**. `restart: unless-stopped` so it survives reboots.

One-time cutover from the old hand-run container:

```bash
docker rm -f metahunt-railway-db   # stopped manual pg18 container; frees 54323 + the volume
pnpm db:up                          # infra db adopts the same volume
```

**Password.** The prod-restore cluster's `pg_hba.conf` trusts localhost but
requires the real password (scram) for other containers, so `POSTGRES_PASSWORD`
in `.env` must equal the password in `DATABASE_URL`. compose interpolates it into
the infra db, Temporal's `POSTGRES_PWD`, and the etl container's `DATABASE_URL`.

**Temporal schemas.** The prod-restore cluster has no `temporal` /
`temporal_visibility` databases; `temporalio/auto-setup` creates them on first
`db:up` (metahunt is superuser). They coexist with app data by design.

## Notes

- **Why bridge, not `--network host`:** on Docker Desktop a host-networked
  container's ports aren't reachable from the host, so the browser couldn't hit
  etl/web. Published ports on the bridge work.
- The production image is unchanged: `Dockerfile` (etl multi-stage, Railway) and
  the root `.dockerignore` (which excludes `apps/web`) are separate from these
  dev files.
