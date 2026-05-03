# Frontend migration into monorepo + Vercel

**Started:** 2026-05-03 · **Stage:** parallel (does not block Stage 04 ETL work) · **Decision:** [ADR-0005](../decisions/0005-vercel-for-frontend.md)

Bring the standalone Next.js 16 client at `~/projects/metahunt-client/` into this monorepo as `@metahunt/web`, then deploy it on Vercel from `apps/web/` of this repo. Backend (ETL) stays on Railway, untouched. **Scope is intentionally narrow: move the code, get Vercel green from the new source. Anything API-related (CORS on ETL, `NEXT_PUBLIC_API_URL`, first endpoint) is a separate, future migration.**

## Resume here

**Status:** code import + PR merged (T0..T3 done). Open items: T4a (create new Vercel project), T4b (migrate custom domain), T4c (archive old repo + optionally delete old Vercel project). All three are manual UI steps in Vercel/GitHub — covered by [`md/runbook/vercel-deploy.md`](../../runbook/vercel-deploy.md).

> **Course correction on the Vercel side (2026-05-03):** original plan was to *reconnect* the existing `metahunt-client` Vercel project to the monorepo. Switched to **new Vercel project + domain migration** — cleaner separation, old project's deployment history preserved untouched, no risk of Vercel caching outdated repo tree from the reconnect operation. ADR-0005 consequences updated to match.

## Status

| # | Task | Status | Done in |
|---|---|---|---|
| T0  | Tracker + ADR-0005 + Vercel runbook | ✅ done | 2026-05-03 |
| T1  | Import `metahunt-client/` → `apps/web/` (clean copy, package rename, lockfile regen) | ✅ done | 2026-05-03 |
| T2  | Repo plumbing — `.dockerignore`, `.gitignore`, `architecture/overview.md`, release note | ✅ done | 2026-05-03 |
| T3  | Open PR; merged to `main` (PR #4) | ✅ done | 2026-05-03 |
| T4a | Create new Vercel project from `apps/web/` (Root Directory + Install Command + Ignored Build Step) | ⏳ pending | |
| T4b | Migrate custom domain from old Vercel project to the new one (sequential cutover) | ⏳ pending | |
| T4c | Archive `maxxik2004/metahunt-client` on GitHub; optionally delete the old Vercel project | ⏳ pending | |

## Why this migration

The frontend currently lives in a separate GitHub repo wired to its own Vercel project. We have two reasons to consolidate:

1. **One source of truth for the product.** A backend that knows about jobs (`@metahunt/etl`) and a frontend that will display them benefit from co-located code, shared types when needed, single PR for cross-cutting changes (e.g. "add `engagementType` filter"), and one CLAUDE.md story for any future agent work.
2. **No deployment lock-in.** Both Railway and Vercel build from a subset of the monorepo and ignore the rest — Railway via `railway.json watchPatterns` + a Dockerfile that selectively copies only `apps/etl/` + `libs/database/`; Vercel via "Root Directory" + an Ignored Build Step. A change to `apps/web/` won't trigger a Railway build, and vice versa.

API stays in `@metahunt/etl` for now. When the API surface grows enough to warrant it, we'll extract `apps/api` — that's a future migration, not in scope here.

## Decisions (locked at 2026-05-03)

| Question | Choice | Rationale |
|---|---|---|
| Workspace name + path | **`@metahunt/web`** at `apps/web/` | "web" is the conventional name for "the user-facing Next.js app" in pnpm monorepos and leaves room for `apps/api`, `apps/admin`, etc. without rename later. The package name uses the existing `@metahunt/*` scope. |
| Git history of standalone repo | **Clean copy, no history transfer** | The frontend has ~10 commits, all small landing iterations ("added favicon", "layout fixes"). History value is low; the cost of `git subtree`/`filter-repo` is real noise in `git log` and merge-commit weirdness. We open a single `feat(web): import frontend into monorepo` commit. |
| Package manager | **pnpm (matches monorepo).** Frontend's `package-lock.json` is dropped; `pnpm install` at the root regenerates `pnpm-lock.yaml`. | Mixed lockfiles in one repo are a known foot-gun. The frontend has no native deps that would be sensitive to the resolver. |
| API integration | **Out of scope of this migration.** No CORS work on ETL, no `NEXT_PUBLIC_API_URL`, no fetch calls added to web. | Goal here is "move code, keep deploy alive". When the first endpoint that web actually consumes lands, that ticket adds CORS to ETL, declares the env var on Vercel, and writes the typed fetch helper. Bundling those into this migration would conflate "no-behaviour-change move" with "new feature", making rollback harder. |
| `tsconfig.json` of `apps/web` | **Standalone, no `extends ../../tsconfig.base.json`** | Next.js's `tsconfig` has many `next`-specific bits (paths, plugins, JSX). Inheriting from a generic base creates conflicts. Re-evaluate if a second app shows up that wants to share. |
| What from old repo gets dropped | `.claude/`, `.codex`, `.mcp.json`, `AGENTS.md`, `README.md` (boilerplate), `package-lock.json`, `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` | Monorepo CLAUDE.md + agent setup already cover the whole repo. The frontend's `AGENTS.md` had one useful note ("this is not the Next.js you know"); that note moves into a short `apps/web/CLAUDE.md`. |
| `landing.pen` (Pencil design file, 266KB) | **Move to `apps/web/design/landing.pen`** | The design source belongs next to the code that implements it. |
| Vercel build command | **Default Next preset** with **Install Command = `cd ../.. && pnpm install --frozen-lockfile`** and **Root Directory = `apps/web`** | Vercel auto-detects Next; install happens at root so workspaces resolve correctly. |
| Skip Vercel rebuilds on backend-only changes | **Ignored Build Step** runs `git diff HEAD^ HEAD --quiet -- ../../apps/web ../../libs ../../package.json ../../pnpm-lock.yaml` and skips when no relevant change | Saves CI minutes; backend-only commits (`apps/etl/**`, `Dockerfile`, `railway.json`) won't trigger a Vercel build. |
| Vercel project shape | **New Vercel project from monorepo, not a reconnect of the old one.** Course-corrected from the original plan. | Cleaner separation, old project's deployment history preserved untouched, no risk of Vercel caching an outdated repo file tree from the reconnect operation. Procedure in [`md/runbook/vercel-deploy.md`](../../runbook/vercel-deploy.md). |
| Domain cutover | **Sequential: remove from old → add to new.** ~30s downtime, no DNS propagation. | A custom domain can only be active on one Vercel project at a time. DNS records at the registrar (or Vercel nameservers) don't change — they keep pointing at Vercel's edge; Vercel routes internally based on which project owns the domain. |
| Old repo lifecycle | **Archive on GitHub only after the new Vercel project is live and the domain has been migrated** | If anything in the new setup fails, we can revert the domain to the old project (still pointing at the old repo) with ~30s downtime. |
| Branch name | **`feat/frontend-migration`** off `main` | Per project convention (branch = task ID = tracker slug). Does not touch `feat/workflow-scheduler`. |

## Out of scope

- **All API integration**: enabling CORS on ETL, `CORS_ORIGINS` env var, `NEXT_PUBLIC_API_URL` on Vercel, the first typed fetch helper in `apps/web/lib/api.ts` — none of this happens here. The first ticket that needs frontend → backend data does this work end-to-end.
- Adding API endpoints to ETL (jobs list, search, etc.) — per-feature work, far after this migration lands.
- Splitting `apps/api` from `apps/etl` — future migration when ETL gets crowded.
- Shared `libs/contracts` for types between backend and frontend — wait until there's a real type to share.
- CI pipeline (lint/test on PR) for `@metahunt/web` — Stage 05 work.
- Custom domain configuration on Vercel — user-configured later.

## Tasks

Each task lands at a verifiable boundary. Commits are small and descriptive; the PR collects them.

### T0 — Tracker + ADR-0005 + Vercel runbook stub ✅

**Goal:** Design and rollout plan landed in repo; reviewer can read the spec without context from the chat.

**Files (delivered):**
- `md/journal/migrations/frontend-migration.md` — this tracker
- `md/journal/decisions/0005-vercel-for-frontend.md` — ADR
- `md/runbook/vercel-reconnect.md` — step-by-step UI clicks for the manual Vercel re-pointing

**Verify:** files exist; `find md -name '*.md' -exec wc -l {} \; | sort -rn | head` shows none over the size cap.

---

### T1 — Import `metahunt-client/` → `apps/web/` (clean copy, package rename, lockfile regen)

**Goal:** `pnpm --filter @metahunt/web dev` serves the landing on http://localhost:4000; `pnpm --filter @metahunt/web build` exits 0. Behavior identical to the standalone repo.

**Steps:**
1. Create `apps/web/` and copy from `~/projects/metahunt-client/` excluding: `.git/`, `node_modules/`, `.next/`, `package-lock.json`, `tsconfig.tsbuildinfo`, `.claude/`, `.codex`, `.mcp.json`, `AGENTS.md`, `README.md`. Keep: `app/`, `components/`, `lib/`, `public/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `package.json`, `.gitignore` (frontend's), `landing.pen`.
2. Move `landing.pen` → `apps/web/design/landing.pen`.
3. Rewrite `apps/web/package.json`: `name: "@metahunt/web"`, `private: true`, scripts unchanged (`dev: next dev --port=4000`, `build: next build`, `start: next start`, `lint: eslint`).
4. Write `apps/web/CLAUDE.md` — short scope file: Next.js 16 caveat (link to `node_modules/next/dist/docs/`) + pointer to root CLAUDE.md.
5. Append to `apps/web/.gitignore`: ensure `.vercel`, `.env*.local`, `.next/` are listed (the frontend's already covers these).
6. From repo root: `pnpm install` — regenerates `pnpm-lock.yaml` and creates `apps/web/node_modules/` symlinked to the workspace store.
7. Smoke: `pnpm --filter @metahunt/web dev` → open http://localhost:4000 → landing renders; `pnpm --filter @metahunt/web build` → exits 0.

**Files (will be delivered):**
- `apps/web/**` — full copy
- `apps/web/CLAUDE.md` — new short scope file
- `pnpm-lock.yaml` — regenerated at root

**Verify:**
- `pnpm --filter @metahunt/web dev` serves on port 4000
- `pnpm --filter @metahunt/web build` exits 0
- `pnpm --filter @metahunt/etl build` still exits 0 (no cross-pollution)
- `pnpm dev` (root parallel) starts both etl and web cleanly

**Commit:** `feat(web): import metahunt-client into apps/web`

---

### T2 — Repo plumbing (Docker, gitignore, architecture, release note)

**Goal:** Backend Docker build still ignores `apps/web/`, repo-level docs reflect the new app, release note exists.

**Steps:**
1. Append `apps/web` to `.dockerignore` (defense in depth — Dockerfile already copies selectively, this just shrinks the build context upload).
2. Append to root `.gitignore`: `.vercel/`, `apps/web/.next/`, `apps/web/.env*.local`, `apps/web/tsconfig.tsbuildinfo` (only if not already covered).
3. Update `md/architecture/overview.md`:
   - Add row to Monorepo packages table: `@metahunt/web | app | apps/web/ | Next.js 16 frontend (landing + future app shell), deployed to Vercel`.
   - Add a "Deployment" section with two subsections (Railway → ETL; Vercel → web).
4. Append release note in `md/journal/releases.md`.
5. Sanity check: `find md product -name '*.md' -exec wc -l {} \; | sort -rn | head` — confirm no file over its cap.

**Files (will be delivered):**
- `.dockerignore`, `.gitignore` — appended lines
- `md/architecture/overview.md` — Monorepo table + new Deployment section
- `md/journal/releases.md` — release entry

**Verify:**
- `docker build .` from repo root succeeds and image does NOT contain `/app/apps/web` (`docker run --rm <img> ls /app/apps` shows only `etl`)
- Architecture overview table shows the new row

**Commit:** `chore(repo): wire @metahunt/web into docs + ignore lists`

---

### T3 — Open PR; merged to `main` ✅

PR #4 ("Frontend: import metahunt-client into monorepo + Vercel reconnect") opened from `feat/frontend-migration` and merged to `main` on 2026-05-03 (commit `bc41010`). PR title still says "reconnect" — the actual deploy approach was course-corrected to "new Vercel project + domain migration" after merge; ADR-0005 and this tracker reflect the new direction.

---

### T4a — Create new Vercel project from `apps/web/`

**Goal:** A new Vercel project ships `apps/web/` from `m4xx1k/metahunt_solo@main`, deployed at `<project-name>.vercel.app`. Old `metahunt-client` Vercel project untouched and still serves the custom domain.

**Steps (full version in [`md/runbook/vercel-deploy.md`](../../runbook/vercel-deploy.md) §1–3):**
1. Vercel → Add New → Project → Import `m4xx1k/metahunt_solo`.
2. Configure: Root Directory `apps/web`, Install Command `cd ../.. && pnpm install --frozen-lockfile`, Framework auto-detected as Next.js. No env vars.
3. Deploy. Wait for green.
4. Settings → Git → Ignored Build Step: `git diff --quiet HEAD^ HEAD -- . ../../libs ../../package.json ../../pnpm-lock.yaml`.

**Verify:**
- `<new-project-name>.vercel.app` renders the landing identically to the old `metahunt-client.vercel.app`.
- A backend-only commit (e.g. `apps/etl/**`) shows "Build Skipped — Ignored Build Step" in the Deployments tab.
- Railway dashboard: no new deployment was triggered.

> Common gotcha: if the file browser on the Configure screen doesn't list `apps/web`, Vercel cached the repo tree before the merge. Fix by refreshing GitHub App permissions or by typing `apps/web` into the Root Directory text field directly. See runbook §1 note.

---

### T4b — Migrate custom domain from old Vercel project to the new one

**Goal:** The custom domain that today serves the old `metahunt-client` Vercel project moves to the new project. ~30s downtime, no DNS propagation wait.

**Steps (full version in [`md/runbook/vercel-deploy.md`](../../runbook/vercel-deploy.md) §4):**
1. Old project → Settings → Domains → Remove the custom domain.
2. New project → Settings → Domains → Add Domain → enter the same domain → Add.
3. Wait for SSL re-issue (~10–60 sec).
4. Open the custom domain in incognito → confirm it serves the new project.

**Verify:**
- Custom domain serves the new project's landing.
- `dig <domain> +short` still returns Vercel's edge (`cname.vercel-dns.com` or `76.76.21.21`) — no DNS records changed, only Vercel's internal routing.
- HTTPS cert is valid (browser shows green padlock).

**Rollback:** remove from new, re-add on old. ~30s downtime, no data loss.

---

### T4c — Archive `maxxik2004/metahunt-client` on GitHub

**Goal:** Old standalone repo is archived (read-only); old Vercel project optionally deleted.

**Steps:**
1. GitHub → `maxxik2004/metahunt-client` → Settings → Danger Zone → Archive repository.
2. (Optional) Vercel → old `metahunt-client` project → Settings → Advanced → Delete Project. Or just leave it for the deployment history.
3. Update this tracker's Status table to all ✅, move to `md/journal/migrations/_done/` per project convention.

**Verify:**
- Old GitHub repo shows "Archived" badge.
- Tracker filed under `_done/`.

## Open items

- [ ] Custom domain on Vercel — user-configured later.
- [ ] First API endpoint that frontend consumes (e.g. `GET /api/v1/jobs?limit=20`) — separate ticket; that ticket also adds CORS to ETL and `NEXT_PUBLIC_API_URL` to Vercel.
- [ ] Lint/test pipeline for `@metahunt/web` — Stage 05.
