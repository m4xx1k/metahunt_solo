# Runbook — Deploy `@metahunt/web` on Vercel

**Audience:** the person who owns the Vercel account / projects (only the project owner can connect repos and manage domains). Designed to be doable from a phone where called out.

**When to use this runbook:**
- **First-time setup** of a Vercel project for `apps/web/` of this monorepo (sections 1–3).
- **Domain migration** from a previously-deployed standalone Vercel project (e.g. the old `metahunt-client`) to the new monorepo project (sections 4–5).
- **Both** if you're cutting over from a standalone-repo Vercel project to a monorepo Vercel project (run all sections in order — but **don't remove the old domain until the new project deploys cleanly on its `*.vercel.app` URL first**).

## 1. Create the new Vercel project

1. **vercel.com → Add New → Project**.
2. **Import Git Repository:** pick `m4xx1k/metahunt_solo`. If the repo isn't visible — *Adjust GitHub App Permissions* → make sure the repo is allowed (or grant access to *All repositories*).
3. On the **Configure Project** screen — **don't click Deploy yet:**
   - **Project Name:** anything (e.g. `metahunt-web`).
   - **Framework Preset:** Next.js (auto-detected from `apps/web/package.json`).
   - **Root Directory:** click **Edit** → in the file browser, navigate **`apps`** → **`web`** → select → **Continue**. The field should now show `apps/web`. **Without this step the build will fail** because Vercel will look for Next.js at the monorepo root.
   - **Build and Output Settings → Override Install Command:** `cd ../.. && pnpm install --frozen-lockfile`. This is required because pnpm workspaces only resolve correctly when install runs from the monorepo root.
   - **Build Command, Output Directory:** leave defaults.
   - **Environment Variables:** leave empty. The landing is fully static, no API calls. (When the first endpoint is consumed, that ticket adds `NEXT_PUBLIC_API_URL` and CORS to ETL — see ADR-0005.)
4. **Deploy.** First build is ~1–2 min.
5. When the deploy is green — open `<project-name>.vercel.app` and confirm the landing renders.

> **If the file browser doesn't show `apps/web`:** Vercel cached the repo tree before `apps/web` was merged. Fix: GitHub → Settings → Applications → Vercel → Configure → Save (forces refresh) → restart the import. Or just type `apps/web` directly into the Root Directory text field — Vercel accepts it without the browser.

## 2. Add the Ignored Build Step

Vercel rebuilds on every commit by default — including backend-only commits that don't touch `apps/web/`. Configure it to skip those.

1. **Settings → Git → Ignored Build Step**, paste exactly:
   ```
   git diff --quiet HEAD^ HEAD -- . ../../libs ../../package.json ../../pnpm-lock.yaml
   ```
2. **Save.**

> Vercel runs this from the Root Directory (`apps/web`), so `.` means `apps/web/`. Exit conventions: **0 = skip the build**, **1 = build**. `git diff --quiet` exits 0 when none of the listed paths changed in the last commit — exactly what we want when a commit only touched `apps/etl/**`, `Dockerfile`, etc. On the very first deployment after this is set (no `HEAD^` available in some edge cases), Vercel falls back to building, which is correct.

## 3. Verify the new project on `*.vercel.app`

1. Open the project's Production URL: `<project-name>.vercel.app`.
2. The landing renders identically to the old `metahunt-client.vercel.app`.
3. (Smoke for ignored-build) Push a backend-only commit (e.g. an `apps/etl/**` change). The Vercel deployments tab should show "Build Skipped — Ignored Build Step" — confirming the filter works.
4. Push a `apps/web/**` change. Vercel should build.

## 4. (Optional) Migrate the custom domain from the old Vercel project

A single custom domain can only be active on **one** Vercel project at a time. Cutover is sequential: remove from old → add to new.

DNS records at the registrar (or Vercel nameservers, if you delegated) **don't change**. They keep pointing at Vercel's edge — Vercel internally routes the request to whichever project owns the domain. Result: ~30 seconds of downtime, no DNS propagation wait.

**Sequence:**

1. **Old Vercel project → Settings → Domains** → find the custom domain → **Remove**. The domain frees up immediately.
2. **New project → Settings → Domains** → **Add Domain** → enter the same domain → Add.
   - DNS verification: instant if records already point to Vercel.
   - HTTPS cert: re-issued automatically (~10–60 sec).
3. Open the custom domain in incognito → confirm it serves the new project.

**If verification stalls on "Verifying":**

- Check current DNS: `dig <your-domain> +short`. Expected: `cname.vercel-dns.com` or Vercel IP `76.76.21.21`.
- If something else: Vercel will display a TXT record to add at the registrar for ownership proof. Add it, wait a minute, click Verify.

**Rollback** (if the new project is broken after cutover):

1. **New project → Settings → Domains → Remove**.
2. **Old project → Settings → Domains → Add Domain** → re-add.
3. ~30 sec of downtime, no data loss.

## 5. Archive the old setup

Only after sections 1–4 are green and you've watched the new project serve real traffic for at least a few requests:

1. **GitHub → `maxxik2004/metahunt-client` → Settings → Danger Zone → Archive repository.** Becomes read-only; deployments history stays visible.
2. **Vercel → old `metahunt-client` project** → optional: leave it (deployment history) or **Settings → Advanced → Delete Project** if you want a clean slate. Deletion is irreversible; archiving the repo is enough to prevent future deploys.
