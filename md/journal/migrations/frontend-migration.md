# Frontend migration into monorepo + Vercel

**Started:** 2026-05-03 · **Stage:** parallel (does not block Stage 04 ETL work) · **Decision:** [ADR-0005](../decisions/0005-vercel-for-frontend.md)

Bring the standalone Next.js 16 client at `~/projects/metahunt-client/` into this monorepo as `@metahunt/web`, then reconnect the existing Vercel project so it builds from `apps/web/` of this repo. Backend (ETL) stays on Railway, untouched. **Scope is intentionally narrow: move the code, get Vercel green from the new source. Anything API-related (CORS on ETL, `NEXT_PUBLIC_API_URL`, first endpoint) is a separate, future migration.**

## Resume here

**Status:** T0 done (tracker landed). Next pickup is **T1 — Import client files into `apps/web/`**.

Quick context: the standalone repo is a landing site (~10 commits, Next 16 + React 19 + Tailwind v4 + shadcn + Phosphor + Radix), uses npm. We do a clean file copy (no git history), rename package to `@metahunt/web`, regenerate `pnpm-lock.yaml` at the root, verify dev/build locally, open a PR, then the reviewer repoints Vercel from the old standalone repo to the monorepo (manual UI step). Old repo stays live until the new Vercel deploy is green; only then it's archived.

## Status

| # | Task | Status | Done in |
|---|---|---|---|
| T0 | Tracker + ADR-0005 + Vercel runbook stub | ✅ done | 2026-05-03 |
| T1 | Import `metahunt-client/` → `apps/web/` (clean copy, package rename, lockfile regen) | ⏳ pending | |
| T2 | Repo plumbing — `.dockerignore`, `.gitignore`, `architecture/overview.md`, release note | ⏳ pending | |
| T3 | Open PR; reviewer does Vercel reconnect (manual UI step per runbook) | ⏳ pending | |
| T4 | Verify Vercel deploy live; archive old `metahunt-client` repo on GitHub | ⏳ pending | |

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
| Old repo lifecycle | **Archive on GitHub only after Vercel reconnect deploy is green** | If reconnect fails, we can flip Vercel back to the old repo with zero downtime. |
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

### T3 — Open PR; reviewer does Vercel reconnect (manual UI step)

**Goal:** Reviewer (the user, on phone) sees the full migration in a PR, follows `md/runbook/vercel-reconnect.md` to repoint Vercel from `maxxik2004/metahunt-client` to the monorepo with `Root Directory = apps/web`.

**Steps (this side):**
1. Push `feat/frontend-migration` to origin.
2. Open PR titled "Frontend: import into monorepo + Vercel reconnect" — body links to this tracker, ADR-0005, and the runbook.
3. PR is **draft** until T1–T2 are confirmed locally green; flipped to "Ready for review" once green.
4. Send push notification to reviewer with PR URL.

**Steps (reviewer side, from phone — full version in [`md/runbook/vercel-reconnect.md`](../../runbook/vercel-reconnect.md)):**
1. Vercel Dashboard → metahunt-client project → Settings → Git → Disconnect.
2. Connect to monorepo, branch `main`.
3. Build & Development Settings → Root Directory = `apps/web`.
4. Build & Development Settings → Install Command: `cd ../.. && pnpm install --frozen-lockfile`.
5. Git → Ignored Build Step: `git diff --quiet HEAD^ HEAD -- . ../../libs ../../package.json ../../pnpm-lock.yaml`.
6. Trigger a Preview deploy from this PR.

> No env vars to add. No Railway changes. The frontend is statically rendered from `landing-data.tsx` — it doesn't talk to the backend yet.

**Verify:**
- Vercel deploy on the PR succeeds; preview URL renders the landing.
- Railway dashboard shows **no** new deployment for this PR.

---

### T4 — Verify Vercel deploy live; archive old `metahunt-client` repo

**Goal:** Production Vercel deploy is green from monorepo `main`; old standalone repo is archived (read-only) on GitHub.

**Steps:**
1. After PR merge: Vercel auto-deploys from `main`. Verify Production URL serves the landing.
2. On GitHub: `maxxik2004/metahunt-client` → Settings → Danger Zone → Archive repository.
3. Update this tracker's Status table to all ✅, move to `md/journal/migrations/_done/` per project convention.

**Verify:**
- Production Vercel URL serves landing.
- Old GitHub repo shows "Archived" badge.
- Tracker filed under `_done/`.

## Open items

- [ ] Custom domain on Vercel — user-configured later.
- [ ] First API endpoint that frontend consumes (e.g. `GET /api/v1/jobs?limit=20`) — separate ticket; that ticket also adds CORS to ETL and `NEXT_PUBLIC_API_URL` to Vercel.
- [ ] Lint/test pipeline for `@metahunt/web` — Stage 05.
