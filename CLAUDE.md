# CLAUDE.md — metahunt

Auto-loaded into every session. Rules first, then a map, then how to run and operate
things. Depth lives in `md/` — this file routes, it does not restate.

**metahunt** — candidate-first job radar for the Ukrainian IT market: aggregate DOU +
Djinni, dedup, rank against a CV, deliver over Telegram. pnpm-workspace monorepo: NestJS +
Temporal (`apps/etl`), Next.js (`apps/web`), drizzle + Postgres (`libs/database`).

**Skip rule.** If the user names a specific file in chat, read that file and skip the
routing below.

---

## 1. Working with the owner

Solo project, one owner, English artifacts / Ukrainian chat.

- **Grill before you guess.** Two readings of the request → materially different work? Ask,
  batched, at the point it blocks. Do everything that doesn't depend on the answer first.
- **Simple → complex.** Lead with the plain statement of what happened or what to do. Never
  open with a term the owner hasn't used yet; a term you introduce gets one clause inline.
- **Report honestly.** Tests failing → paste the output. Step skipped → say which and why.
  "Seems to work" is not "verified".
- **English everywhere** in artifacts: code, docs, commits, issues, skills. Ukrainian stays
  chat-only.

## 2. MUST

- **Run the stack in Docker.** `pnpm docker:up` (frontend) or `pnpm docker:dev` (etl /
  database). Native `pnpm dev` only when Docker is genuinely in the way — say so when you do.
- **Treat the prod database as read-only.** Reads and dry-runs are free. Any write — an
  UPDATE/DELETE, a `--apply` run, a migration against prod — needs an explicit go-ahead from
  the owner, per operation. `--yes-prod` is not self-service.
- **Back up before anything destructive to data:** `scripts/db-backup.sh` first.
- **Name the database before writing to it** — never inline a connection string, inject it
  (`DATABASE_URL=$(scripts/prod-db-url.sh) <cmd>`). Admin CLIs print `target: host:port/db`
  and refuse a non-local write without `--yes-prod` — that guard exists because a worktree
  `.env` once sent `taxonomy:migrate --apply` at the wrong database and reported success
  (MET-133, `apps/etl/src/platform/config/db-target.ts`).
- **Check `compose.override.yaml` exists** before booting etl locally — it blanks the
  Telegram token and PostHog keys. Without it a local etl steals real Telegram updates from
  the Railway instance and pollutes prod analytics.
- **Pause Temporal schedules before any migration that mutates taxonomy or vacancies:**
  `scripts/temporal-schedules.ts pause "<reason>"`, resume after.
- **Generate schema changes** with `pnpm db:generate` so SQL and `migrations/meta/*` stay
  in sync.
- **No real user PII in the repo** — no Telegram ids, `@usernames`, names, emails, phones,
  CV text. Use `owner` / `tester-1..N`. Full rule: [`md/README.md#hygiene`](md/README.md#hygiene).
- **Minimal comments** — the non-obvious *why* only, ≤2 lines, never paragraphs. Full rule:
  [`md/engineering/STYLE.md#comments`](md/engineering/STYLE.md#comments).
- **Close a task through the checklist** in
  [`md/engineering/DOCUMENTATION.md#closing--in-this-order`](md/engineering/DOCUMENTATION.md).

## 3. NEVER

- Never `npm` / `yarn` — pnpm only, anything else trashes the lockfile.
- Never commit or push straight to `main`. Branch → PR → merge, so `origin/main` stays green
  and any session can start clean from it.
- Never commit secrets. `.env`, `.env.local`, `.dev-admin.jwt`, `.private/`, `backups/` are
  gitignored and stay that way — **the repo is public.**
- Never add a one-shot script to `scripts/` — see [`scripts/README.md`](scripts/README.md)
  for where a backfill goes instead.
- Never leave a worktree or its containers running after the work merges (§7).
- Never import across packages by relative path — the package name, always
  (`@metahunt/database`).

---

## 4. Where things live

```
apps/etl/     @metahunt/etl      NestJS API + ETL pipeline + Temporal worker  → Railway
apps/web/     @metahunt/web      Next.js public site + account/operator UI    → Vercel
apps/lab/     @metahunt/lab      isolated Vite research app (skill graph)     — local only
libs/database @metahunt/database drizzle schema, migrations, seeds
scripts/      operator tools only (permanent, re-runnable) — scripts/README.md
md/           engineering docs — architecture/ journal/ runbook/ engineering/ roadmap.md
.private/     product / business / strategy — gitignored, local only
backups/      local DB dumps — gitignored
```

## 5. Running it

```bash
pnpm docker:infra   # Postgres + MinIO + Temporal + Temporal UI — also needed for native runs
pnpm docker:up      # infra + etl + web, detached. Frontend work: this one.
pnpm docker:dev     # same, foreground, + `docker compose watch` → etl reloads too
```

Ports: web `4000`, etl `3333` in Docker / `3000` native fallback, Postgres `54323`, Temporal
`7233` (UI `8080`), MinIO `9000`/`9001`. Health: `curl localhost:3333/`. Full detail
(reload model, healthchecks, native fallback): [`md/runbook/docker-dev.md`](md/runbook/docker-dev.md).

## 6. Commands and access

**Build / test / db:** `pnpm build:all`, `pnpm test:etl[:int]`, `pnpm test:web`, `pnpm lint`.
`pnpm db:generate | db:migrate | db:check | db:seed | db:studio`.

**Guards that also run in CI** — run before touching their area: `pnpm seo:audit`,
`pnpm analytics:catalog`, `pnpm db:check`, `pnpm baml:identity:check`.

**Pipeline / admin CLIs** (dry-run by default, `--apply` mutates): `pnpm dedup:embed |
dedup:resolve | dedup:reset`, `pnpm skills:classify`, `pnpm taxonomy:migrate`.

**Hit the local API without a browser login:**

```bash
pnpm dev:jwt                                   # mints .dev-admin.jwt for an existing local user
curl -H "Authorization: Bearer $(cat .dev-admin.jwt)" http://localhost:3333/me/subscriptions
```

Signs with the local `JWT_SECRET` in `.env` — the token verifies only against the local etl,
never prod. Never creates a user; the Telegram id must have logged in once already. See
`scripts/dev-jwt.sh`.

**Prod — read-only by default:**

```bash
DATABASE_URL=$(scripts/prod-db-url.sh) psql                # ad-hoc read
DATABASE_URL=$(scripts/prod-db-url.sh) pnpm dedup:resolve   # dry-run against real data
```

`scripts/prod-db-url.sh` fetches the Railway `DATABASE_PUBLIC_URL` fresh per call — nothing
lands in a file or shell history. Writes still need §2. Dumps/restore:
`scripts/db-backup.sh`, `scripts/db-restore.sh` (drops the target db, prompts).

**CLIs on this machine:** `railway`, `vercel`, `gh`, `docker`, `psql`/`pg_dump`. No PostHog
CLI — use the PostHog MCP server / `posthog:*` skills (prod project **239290**). Deploy
detail: [`md/runbook/railway-deploy.md`](md/runbook/railway-deploy.md) (etl),
[`md/runbook/vercel-deploy.md`](md/runbook/vercel-deploy.md) (web). Temporal schedules:
`scripts/temporal-schedules.ts list|pause|resume`.

## 7. Branches and worktrees

**Default: work directly in `/home/maxxik/solo/metahunt_solo`,** on a branch
`<type>/<slug>` — the slug is the task ID across docs, see
[`md/engineering/DOCUMENTATION.md#branch-name--task-id`](md/engineering/DOCUMENTATION.md).
Keep `origin/main` clean and current so the next session can start work with nothing to
untangle.

Reach for a worktree only for genuinely parallel work.

```bash
git worktree add ../mh-<slug> -b feat/<slug>
```

- **Give it its own `.env`, re-point `DATABASE_URL` deliberately** — a copied `.env` is how
  MET-133 happened. Print the target before any `--apply`.
- **Share the shared infra, don't clone it.** `compose.infra.yaml` owns one Postgres /
  Temporal / MinIO on fixed host ports. Run the worktree's apps natively against it, or give
  the app stack its own compose project **and** override `container_name` + host ports
  (`compose.yaml` hardcodes both — `-p` alone doesn't avoid a collision).

**Finishing is part of the task:**

```bash
docker compose -p <project> down -v   # only if the worktree ran its own containers
git worktree remove ../mh-<slug> && git worktree prune
git branch -d feat/<slug>
```

Check `git worktree list` and `docker ps` before calling the work done — a worktree that
outlives its PR is stale code plus phantom containers.

## 8. Routing — which doc first

| Task | First file |
|---|---|
| Engineering work (feature, fix, refactor) | `md/engineering/DOCUMENTATION.md` |
| "What's the system shape?" | `md/architecture/overview.md` |
| "Why did we decide X?" | `md/journal/decisions/` (the relevant ADR) |
| Active multi-step initiative | `md/journal/migrations/<branch-slug>.md` |
| Deploy, debug, env, local stack | `md/runbook/` |
| Code style / patterns | `md/engineering/STYLE.md`, `md/engineering/DESIGN.md` |
| Errors, logging, security, testing, review | `md/engineering/<TOPIC>.md` |
| Product / UX / pricing / market | `.private/strategy/` (gitignored) |
| Stage status / what's next | `md/roadmap.md` |
| What shipped lately | `md/journal/releases.md` |

## 9. Reading and writing docs

**Max 3 files per task before checking direction with the user.** Read three and still
don't know what to do → stop and ask. Read sections, not whole files
(`grep -n '^#' <path>`, then `Read offset=N limit=M`). Entering a directory, read its
`README.md` / `roadmap.md` first.

Snapshot files (`md/architecture/`) say what *is*; journal files (`md/journal/`) say what
*happened* — don't mix. Link to the section that owns a fact (`file.md#anchor`) instead of
duplicating it. Closed trackers move to `md/journal/migrations/_done/`. Size caps for new
docs: [`md/README.md#size-caps`](md/README.md#size-caps).
