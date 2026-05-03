# Frontend migration into monorepo + Vercel

**Started:** 2026-05-03 · **Stage:** parallel (does not block Stage 04 ETL work) · **Decision:** [ADR-0005](../decisions/0005-vercel-for-frontend.md)

Bring the standalone Next.js 16 client at `~/projects/metahunt-client/` into this monorepo as `@metahunt/web`, then reconnect the existing Vercel project so it builds from `apps/web/` of this repo. Backend (ETL) stays on Railway, untouched. Frontend will start calling the ETL HTTP server via CORS for any data needs; a dedicated `apps/api` is deferred until the ETL split happens.

## Resume here

**Status:** T0 done (tracker landed). Next pickup is **T1 — Import client files into `apps/web/`**.

Quick context: the standalone repo is a landing site (~10 commits, Next 16 + React 19 + Tailwind v4 + shadcn + Phosphor + Radix), uses npm. We do a clean file copy (no git history), rename package to `@metahunt/web`, regenerate `pnpm-lock.yaml` at the root, then verify dev/build locally before opening a PR. Old repo (`maxxik2004/metahunt-client`) stays live until Vercel is reconnected to the monorepo and the deploy is green; only then it's archived.

## Status

| # | Task | Status | Done in |
|---|---|---|---|
| T0 | Tracker + ADR-0005 + Vercel runbook stub | ✅ done | 2026-05-03 |
| T1 | Import `metahunt-client/` → `apps/web/` (clean copy, package rename, lockfile regen) | ⏳ pending | |
| T2 | `apps/etl` — enable CORS, add `CORS_ORIGINS` env | ⏳ pending | |
| T3 | Repo plumbing — `.dockerignore`, `.gitignore`, `architecture/overview.md`, release note | ⏳ pending | |
| T4 | Open PR; reviewer does Vercel reconnect (manual UI step per runbook) | ⏳ pending | |
| T5 | Verify Vercel deploy live; archive old `metahunt-client` repo on GitHub | ⏳ pending | |

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
| API path right now | **Frontend calls `@metahunt/etl` directly via CORS** (e.g. `https://<railway>/healthz`, future `/api/...`) | Avoids a new app+deployment surface for zero net benefit. Split to `apps/api` when ETL gets crowded. |
| `NEXT_PUBLIC_API_URL` location | **Vercel project env var, not committed** | Each Vercel environment (Production/Preview) gets its own value. Default in `apps/web/.env.example` for local dev (`http://localhost:3000`). |
| `tsconfig.json` of `apps/web` | **Standalone, no `extends ../../tsconfig.base.json`** | Next.js's `tsconfig` has many `next`-specific bits (paths, plugins, JSX). Inheriting from a generic base creates conflicts. Re-evaluate if a second app shows up that wants to share. |
| What from old repo gets dropped | `.claude/`, `.codex`, `.mcp.json`, `AGENTS.md`, `README.md` (boilerplate), `package-lock.json`, `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` | Monorepo CLAUDE.md + agent setup already cover the whole repo. The frontend's `AGENTS.md` had one useful note ("this is not the Next.js you know"); that note moves into a short `apps/web/CLAUDE.md`. |
| `landing.pen` (Pencil design file, 266KB) | **Move to `apps/web/design/landing.pen`** | The design source belongs next to the code that implements it. |
| Vercel build command | **Default Next preset** with **Install Command = `cd ../.. && pnpm install --frozen-lockfile`** and **Root Directory = `apps/web`** | Vercel auto-detects Next; install happens at root so workspaces resolve correctly. |
| Skip Vercel rebuilds on backend-only changes | **Ignored Build Step** runs `git diff HEAD^ HEAD --quiet -- ../../apps/web ../../libs ../../package.json ../../pnpm-lock.yaml` and skips when no relevant change | Saves CI minutes; backend-only commits (`apps/etl/**`, `Dockerfile`, `railway.json`) won't trigger a Vercel build. |
| Old repo lifecycle | **Archive on GitHub only after Vercel reconnect deploy is green** | If reconnect fails, we can flip Vercel back to the old repo with zero downtime. |
| Branch name | **`feat/frontend-migration`** off `main` | Per project convention (branch = task ID = tracker slug). Does not touch `feat/workflow-scheduler`. |

## Out of scope

- Adding actual API endpoints to ETL (jobs list, search, etc.) — that's per-feature work after this migration lands.
- Splitting `apps/api` from `apps/etl` — future migration when ETL gets crowded.
- Adding a shared `libs/contracts` for types between backend and frontend — wait until there's a real type to share.
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

**Goal:** `pnpm --filter @metahunt/web dev` serves the landing on http://localhost:4000; `pnpm --filter @metahunt/web build` exits 0.

**Steps:**
1. Create `apps/web/` and copy from `~/projects/metahunt-client/` excluding: `.git/`, `node_modules/`, `.next/`, `package-lock.json`, `tsconfig.tsbuildinfo`, `.claude/`, `.codex`, `.mcp.json`, `AGENTS.md`, `README.md`. Keep: `app/`, `components/`, `lib/`, `public/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `package.json`, `.gitignore` (frontend's), `landing.pen`.
2. Move `landing.pen` → `apps/web/design/landing.pen`.
3. Rewrite `apps/web/package.json`: `name: "@metahunt/web"`, `private: true`, scripts unchanged (`dev: next dev --port=4000`, `build: next build`, `start: next start`, `lint: eslint`).
4. Write `apps/web/CLAUDE.md` — short scope file: Next.js 16 caveat (link to `node_modules/next/dist/docs/`) + pointer to root CLAUDE.md.
5. Write `apps/web/.env.example` with `NEXT_PUBLIC_API_URL=http://localhost:3000`.
6. Append to `apps/web/.gitignore`: ensure `.vercel`, `.env*.local`, `.next/` are listed (the frontend's already covers these).
7. From repo root: `pnpm install` — regenerates `pnpm-lock.yaml` and creates `apps/web/node_modules/` symlinked to the workspace store.
8. Smoke: `pnpm --filter @metahunt/web dev` → open http://localhost:4000 → landing renders; `pnpm --filter @metahunt/web build` → exits 0.

**Files (will be delivered):**
- `apps/web/**` — full copy
- `apps/web/CLAUDE.md` — new short scope file
- `apps/web/.env.example` — new
- `pnpm-lock.yaml` — regenerated at root

**Verify:**
- `pnpm --filter @metahunt/web dev` serves on port 4000
- `pnpm --filter @metahunt/web build` exits 0
- `pnpm --filter @metahunt/etl build` still exits 0 (no cross-pollution)
- `pnpm dev` (root parallel) starts both etl and web cleanly

**Commit:** `feat(web): import metahunt-client into apps/web`

---

### T2 — `apps/etl` CORS + `CORS_ORIGINS` env

**Goal:** Frontend served by Vercel can call ETL HTTP endpoints (`/healthz`, future `/api/...`) without browser CORS errors.

**Steps:**
1. Add `CORS_ORIGINS` to `apps/etl/src/config/env.validation.ts` (Zod string, default `http://localhost:4000`, comma-separated allowed).
2. Add `CORS_ORIGINS` to root `.env.example` with explanation comment (local dev value + Production hint).
3. In `apps/etl/src/main.ts`, after `NestFactory.create(AppModule)`: `app.enableCors({ origin: configService.get('CORS_ORIGINS').split(',').map(s => s.trim()), credentials: true })`.
4. Manual smoke: from `apps/web` running on `:4000`, fire a `fetch('http://localhost:3000/healthz')` from browser console — verify no CORS error.

**Files (will be delivered):**
- `apps/etl/src/main.ts` — `app.enableCors(...)` call
- `apps/etl/src/config/env.validation.ts` — `CORS_ORIGINS` field
- `.env.example` — new var documented

**Verify:**
- ETL still boots: `pnpm --filter @metahunt/etl start:dev` → no env-validation crash
- Browser fetch from `:4000` to `:3000/healthz` succeeds

**Commit:** `feat(etl): enable CORS for web frontend (CORS_ORIGINS env)`

---

### T3 — Repo plumbing (Docker, gitignore, architecture, release note)

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

### T4 — Open PR; reviewer does Vercel reconnect (manual UI step)

**Goal:** Reviewer (the user, on phone) sees the full migration in a PR, follows `md/runbook/vercel-reconnect.md` to repoint Vercel from `maxxik2004/metahunt-client` to the monorepo with `Root Directory = apps/web`.

**Steps (this side):**
1. Push `feat/frontend-migration` to origin.
2. Open PR titled "Frontend: import into monorepo + Vercel reconnect" — body links to this tracker, ADR-0005, and the runbook.
3. PR is **draft** until T1–T3 are confirmed locally green; flipped to "Ready for review" once green.
4. Send push notification to reviewer with PR URL.

**Steps (reviewer side, from phone):**
1. Open Vercel Dashboard → metahunt-client project.
2. Settings → Git → Disconnect from `maxxik2004/metahunt-client`.
3. Settings → Git → Connect to monorepo (`<owner>/metahunt`), branch `main`.
4. Settings → Build & Development Settings → Root Directory = `apps/web`.
5. Settings → Build & Development Settings → Install Command: `cd ../.. && pnpm install --frozen-lockfile`.
6. Settings → Git → Ignored Build Step: `bash -c "git diff HEAD^ HEAD --quiet -- ../../apps/web ../../libs ../../package.json ../../pnpm-lock.yaml; [ \$? -eq 1 ]"`.
7. Settings → Environment Variables: add `NEXT_PUBLIC_API_URL` (Production = `https://<railway-prod-domain>`, Preview = same or staging).
8. Trigger a new deployment from a Preview build of this PR (or merge to `main` and watch Production).

**Verify:**
- Vercel deploy on the PR succeeds and the preview URL renders the landing.
- Backend Railway is **not** rebuilt by this PR (check Railway dashboard for no new deployment).

---

### T5 — Verify Vercel deploy live; archive old `metahunt-client` repo

**Goal:** Production Vercel deploy is green from monorepo `main`; old standalone repo is archived (read-only) on GitHub.

**Steps:**
1. After PR merge: Vercel auto-deploys from `main`. Verify Production URL is healthy.
2. Hit ETL health endpoint from the production frontend (browser fetch to `${NEXT_PUBLIC_API_URL}/healthz`) — confirm 200.
3. On GitHub: `maxxik2004/metahunt-client` → Settings → Danger Zone → Archive repository.
4. Update this tracker's Status table to all ✅, move to `md/journal/migrations/_done/` per project convention.

**Verify:**
- Production Vercel URL serves landing.
- Old GitHub repo shows "Archived" badge.
- Tracker filed under `_done/`.

## Open items

- [ ] Custom domain on Vercel — user-configured later; once it exists, add to `CORS_ORIGINS` on Railway env.
- [ ] First real API endpoint that frontend consumes (e.g. `GET /api/v1/jobs?limit=20`) — separate ticket.
- [ ] Lint/test pipeline for `@metahunt/web` — Stage 05.
