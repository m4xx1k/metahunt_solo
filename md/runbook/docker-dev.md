# Runbook — dockerized dev with live watch

Run the whole stack in Docker with hot-reload, so code edits reflect without
re-upping anything. Both apps watch natively (`nest --watch`, `next dev`);
Docker just carries host file changes into the containers via a bind mount.

## Compose layout

Two files, one project (they're always launched together for dev):

| File | Services |
|---|---|
| `docker-compose.infra.yml` | `db` (Postgres/pgvector **pg18**), `minio`, `minio-init`, `temporal`, `temporal-ui` |
| `docker-compose.dev.yml` | `etl` (NestJS watch), `web` (Next dev) — built from `docker/dev.Dockerfile` |

Because both files run under one compose project they share a default network,
so `etl`/`web` reach `db`, `temporal`, `minio` by **service name**.

## Commands

```bash
pnpm db:up          # infra only (Postgres+MinIO+Temporal) — for running apps natively
pnpm db:down
pnpm dev:docker     # infra + etl + web, all watching (foreground; Ctrl-C to stop)
pnpm dev:docker:down
```

Ports (host): web `4000`, etl `3333`, Postgres `54323`, MinIO `9000`/`9001`,
Temporal `7233`, Temporal UI `8080`.

First `dev:docker` is slow: it builds the dev image, then `etl` runs one
workspace `pnpm install` into named volumes. `web` waits for `etl` to be healthy
(nest listening ⇒ install + database build already done), then starts `next dev`
against the shared, already-populated `node_modules`. Later runs reuse the
volumes, so install is a near-instant no-op.

Rebuild the dev image after changing `docker/dev.Dockerfile`:
`docker compose -f docker-compose.infra.yml -f docker-compose.dev.yml up --build`.

## The database (pg17 → pg18 consolidation)

The real dev data (a prod restore) lives in the **external** volume
`metahunt_railway_pgdata` (pg18). It was previously served by a hand-run
`metahunt-railway-db` container; the infra `db` service now owns it instead:

- `image: pgvector/pgvector:pg18`, `PGDATA=/var/lib/postgresql/18/docker`
  (pg18's image moved the data dir under a version subdir), volume mounted at
  `/var/lib/postgresql`, published on `54323`, db `metahunt_railway`.
- The volume is declared `external: true`, so compose reuses it as-is —
  **no dump/restore, no migration**.
- `restart: unless-stopped` (the manual container had none, so it didn't come
  back after a reboot — that's why `54323` looked dead).

One-time cutover from the old manual container:

```bash
docker rm -f metahunt-railway-db      # stopped manual pg18 container; frees 54323 + the volume
pnpm db:up                            # infra db (pg18) adopts the same volume
```

`.env`'s `DATABASE_URL` stays `...@localhost:54323/metahunt_railway`, so running
apps natively is unchanged. The old empty pg17 volume
(`metahunt_solo_metahunt-db-data`) is left untouched and can be pruned later.

## How the pieces wire up

- **etl → infra:** the `etl` service overrides `DATABASE_URL` to `db:5432`,
  `TEMPORAL_ADDRESS` to `temporal:7233`, `STORAGE_ENDPOINT` to
  `http://minio:9000`. It forces `NODE_ENV=development` (not `local` — that pins
  Temporal to `localhost:7233` and ignores the address) and an empty
  `TEMPORAL_API_KEY` (plaintext to the compose Temporal). Everything else comes
  from `.env` via `env_file`.
- **web → etl:** `lib/api/client.ts` resolves the API base per context — the
  browser uses `NEXT_PUBLIC_API_URL` (`http://localhost:3333`, host-published),
  in-container SSR uses `API_INTERNAL_URL` (`http://etl:3333`, over the network).
  Native dev sets no internal var, so it just uses the public one.
- **Password:** `scripts/compose.sh` (which the `db:*` / `dev:docker` scripts
  call) derives `POSTGRES_PASSWORD` from `DATABASE_URL` — the single source of
  truth — and exports it for compose to interpolate into the infra db, Temporal's
  `POSTGRES_PWD`, and the etl container's `DATABASE_URL`. The prod-restore
  cluster's `pg_hba.conf` trusts localhost but requires the real password
  (scram) for other containers, so this must match. Export `POSTGRES_PASSWORD`
  yourself only to override (e.g. a non-URL-safe password).
- **Temporal schemas:** the prod-restore cluster has no `temporal` /
  `temporal_visibility` databases; `temporalio/auto-setup` creates them on first
  `db:up` (metahunt is superuser, so it can). They coexist with app data in the
  same cluster by design.

## Notes / gotchas

- **Why bridge networking, not `--network host`:** on Docker Desktop a
  host-networked container's ports aren't reachable from the host, so the
  browser couldn't hit etl/web. Published ports on the default bridge are.
- **Watch on Docker Desktop:** bind-mount inotify events can be missed, so the
  containers set `CHOKIDAR_USEPOLLING` (nest) / `WATCHPACK_POLLING` (next).
  Polling costs a little CPU; drop them if your setup sees events reliably.
- `node_modules` are named volumes, never the host's — host and container keep
  independent, platform-correct installs.
- **File ownership:** the containers run as root, so build artifacts they write
  through the bind mount (`apps/etl/dist`, `apps/web/.next`) become root-owned on
  the host. Harmless for git (ignored), but if you later run native dev and hit a
  permission error, reclaim them: `docker run --rm -v "$PWD":/a alpine chown -R
  $(id -u):$(id -g) /a/apps/etl/dist /a/apps/web/.next` (or just delete them). The
  pnpm store is kept in a volume to avoid this class of clutter in the repo root.
- The production image is unchanged: `Dockerfile` (etl multi-stage, Railway)
  has nothing to do with these dev files.
