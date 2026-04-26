# metahunt

Job aggregator for the Ukrainian IT market. Current baseline: pnpm workspaces + Nest ETL app + shared Drizzle/Postgres database package.

## Layout

```
metahunt/
├── apps/
│   └── etl/                    # @metahunt/etl — NestJS HTTP app (Express)
└── libs/
    └── database/               # @metahunt/database — Nest @Global() module
```

- `apps/*` — runnable applications (consumers)
- `libs/*` — reusable packages (consumed by apps)

Package names use the `@metahunt/*` scope. Inside the monorepo they wire up to each other via `workspace:*`.

## Quick start

```bash
pnpm install        # set up symlinks and install deps
pnpm db:up          # start local Postgres (docker)
pnpm db:migrate     # apply drizzle migrations
pnpm db:seed        # seed reference data (sources)
pnpm build          # build libs/database first, then apps/etl
pnpm start          # run etl in prod mode (loads ../../.env if present)
pnpm dev            # dev mode: watch on the lib + nest start --watch on the app
```

Sanity check: `curl http://localhost:3000` → `{"status":"ok","db":"up"}`.

Requires: Node ≥22, pnpm ≥10.

## Scripts

### Root (`/metahunt`)

| Command | What it does |
|---|---|
| `pnpm build` | Builds `libs/database` (`tsc`), then `apps/etl` (`nest build`) |
| `pnpm start` / `pnpm start:prod` | Starts `apps/etl` with `node --env-file-if-exists=../../.env dist/main.js` |
| `pnpm dev` | Pre-builds `libs/database` once, then runs `tsc -w` (lib) + `nest start --watch` (app) in parallel |
| `pnpm db:up` / `pnpm db:down` | Start/stop local Postgres container |
| `pnpm db:generate` | Generate new drizzle migration from current schema |
| `pnpm db:migrate` | Apply migrations to Postgres |
| `pnpm db:seed` | Seed initial reference rows (`sources`) |

### `apps/etl`

| Command | What it does |
|---|---|
| `pnpm --filter @metahunt/etl build` | `nest build` → `apps/etl/dist/main.js` |
| `pnpm --filter @metahunt/etl start` / `start:prod` | `node --env-file-if-exists=../../.env dist/main.js` |
| `pnpm --filter @metahunt/etl start:dev` / `dev` | `nest start --watch` (recompile + restart on changes in `apps/etl/src/`) |
| `pnpm --filter @metahunt/etl start:debug` | Same as dev, but with `--inspect` |

### `libs/database`

| Command | What it does |
|---|---|
| `pnpm --filter @metahunt/database build` | `tsc -p tsconfig.json` → `libs/database/dist/` |
| `pnpm --filter @metahunt/database build:watch` / `dev` | `tsc -w` — incremental rebuild on each change |

### How dev mode works

Because `apps/etl` imports the lib through its compiled `dist/index.js` (the lib's `main` field), the nest-cli watcher **won't see** edits made to the lib's sources. So dev is set up like this:

1. The lib runs its own `tsc -w`, which rewrites `libs/database/dist/` after every edit.
2. The app runs `nest start --watch`, which watches `apps/etl/src/`. It does **not** watch `node_modules`, so after editing **the lib** you need to nudge the app to restart — easiest is to save any file under `apps/etl/src/` (e.g. add/remove a space in `main.ts`), and nest will restart with the new lib.
3. Alternative: stop dev and restart — by then `tsc -w` in the lib has already emitted fresh output.

`pnpm dev` at the root does steps 1+2 in parallel: `pnpm -r --parallel run dev` runs the `dev` script in both packages at once. It does a one-shot lib build first to avoid a startup race.

---

## Working with pnpm workspaces

> This is **not** a NestJS CLI monorepo (one root `package.json` and `nest-cli.json` driving everything). It's pnpm workspaces: **every package has its own `package.json`**, the root just declares that `apps/*` and `libs/*` are workspaces.

### How pnpm finds workspaces

`pnpm-workspace.yaml` at the root:
```yaml
packages:
  - "apps/*"
  - "libs/*"
```
Anything matching those globs that has a `package.json` is a workspace. The workspace name comes from its `name` field (e.g. `@metahunt/database`), **not** from the directory name.

### How packages depend on each other

In `apps/etl/package.json`:
```json
"dependencies": {
  "@metahunt/database": "workspace:*"
}
```
The `workspace:*` prefix tells pnpm: *"resolve from the local workspace, any version"*. After `pnpm install` you'll find a symlink:
```
apps/etl/node_modules/@metahunt/database -> ../../../libs/database
```
The symlink does **not** need to be rebuilt after editing the lib — it always points at the live source. But because the lib is compiled to `dist/`, the app needs a fresh `dist/` to actually run (see below).

### Running scripts

| Goal | Command |
|---|---|
| Run a script in one specific package | `pnpm --filter @metahunt/etl <script>` |
| Run a script in every workspace that has it | `pnpm -r <script>` |
| Run only across apps | `pnpm --filter "./apps/**" <script>` |
| Sequentially: lib first, then app | `pnpm --filter @metahunt/database build && pnpm --filter @metahunt/etl build` |
| Same, but in topological order automatically | `pnpm -r --workspace-concurrency=1 build` (deps build before dependents) |

The root `package.json` scripts (`pnpm build`, `pnpm start`) are thin wrappers around `pnpm --filter`.

### Adding dependencies

| Goal | Command |
|---|---|
| Regular npm package into `apps/etl` | `pnpm --filter @metahunt/etl add <pkg>` |
| Dev dep into `libs/database` | `pnpm --filter @metahunt/database add -D <pkg>` |
| Tool at the repo root (e.g. prettier) | `pnpm add -Dw <pkg>` (`-w` = workspace root) |
| Local workspace as a dep | `pnpm --filter @metahunt/etl add @metahunt/database` (pnpm sets `workspace:^` itself) |

**Don't edit `package.json` by hand to add deps** — use `pnpm add`, otherwise the lockfile drifts.

### How `libs/database` is built

The lib is compiled by plain `tsc -p tsconfig.json` into `libs/database/dist/`. The lib's `package.json` declares:
```json
"main": "dist/index.js",
"types": "dist/index.d.ts"
```
So when `apps/etl` imports `@metahunt/database`, Node resolves `dist/index.js`. Implications:

- **If you edit the lib, you must rebuild it before running the app.** Either one-shot — `pnpm --filter @metahunt/database build` — or in dev mode, `pnpm --filter @metahunt/database dev` keeps `tsc -w` running.
- TypeScript also reads `dist/index.d.ts`, so without a built lib the IDE / `tsc` in the app won't see fresh types either.

### Adding a new workspace

1. Create `apps/<name>/` or `libs/<name>/` with its own `package.json` (`name: "@metahunt/<name>"`, `private: true`, `version: "0.0.0"`).
2. Add a `tsconfig.json` that extends `../../tsconfig.base.json`.
3. Run `pnpm install` at the root — pnpm picks up the new workspace via the glob in `pnpm-workspace.yaml`.

No changes to the root `package.json` are needed.

### Don'ts

- **Don't run `npm install` / `yarn`** — it'll trash the pnpm lockfile. pnpm only.
- **Don't confuse `--filter` and `-r`.** `--filter <name>` targets one package; `-r` recurses across all. They combine: `pnpm -r --filter "./libs/**" build`.
- **Don't commit `dist/`** — it's in `.gitignore`, generated locally and in CI.
- **Don't import between packages via relative paths** (`../../libs/database/src/...`). Always go through the package name (`@metahunt/database`) — relative imports break encapsulation and type resolution.
- **Don't put the same dep into two places by hand.** If `@nestjs/common` is needed in both the lib and the app, declare it in both `package.json`s — pnpm physically deduplicates inside `node_modules/.pnpm/`.

### Useful

- `pnpm list -r --depth -1` — list all workspaces
- `pnpm why <pkg>` — explain why a dep is installed
- `pnpm outdated -r` — outdated versions across all workspaces
- `pnpm dlx <cli>` — run a CLI without installing it (pnpm's `npx`)

---

## Documentation

Engineering docs live in `docs/`. Architecture: **Snapshot + Journal**.

- `docs/architecture/` — how the system is built **right now** (snapshot, updated alongside the code)
- `docs/journal/decisions/` — ADRs (architectural decisions, append-only)
- `docs/journal/releases.md` — log of features / changes
- `docs/roadmap.md` — current stage + plans

How to write — see `docs/README.md`.

## Migration policy

- Use `pnpm db:generate` for schema changes so SQL and `migrations/meta/*` stay in sync.
- Do not hand-edit/add migration `.sql` files without updating drizzle metadata in the same change.
- If a generated migration is a known drift artifact (not a real schema change), remove both files: `migrations/<id>.sql` and `migrations/meta/<id>_snapshot.json`.
- Before merge: run `pnpm db:migrate && pnpm db:seed` and check ETL health (`curl http://localhost:3000`).

## What's next

Small changes go into `docs/journal/releases.md`. Bigger milestones into `docs/roadmap.md`. Up next: Drizzle ORM (Stage 02), Joi env config (Stage 03), first ETL job (Stage 04).
