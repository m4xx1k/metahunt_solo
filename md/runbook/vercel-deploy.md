# Runbook — Deploy `@metahunt/web` on Vercel

How to bring up a new Vercel project for `apps/web/` of this monorepo, and (if needed) move a custom domain from another Vercel project to it.

## 1. Create the project

1. **vercel.com → Add New → Project** → Import `m4xx1k/metahunt_solo`. (If the repo isn't visible: *Adjust GitHub App Permissions*.)
2. On the **Configure Project** screen — **don't click Deploy yet:**
   - **Framework Preset:** Next.js (auto-detected).
   - **Root Directory:** click **Edit** → navigate to `apps/web` → Continue. Without this the build will look for Next.js at the monorepo root and fail. (If the file browser doesn't list `apps/web`, just type the path — Vercel accepts it.)
   - **Build and Output → Override Install Command:** `cd ../.. && pnpm install --frozen-lockfile`. pnpm workspaces only resolve correctly when install runs from the workspace root.
   - **Environment Variables:** none.
3. **Deploy.**

## 2. Add the Ignored Build Step

**Settings → Git → Ignored Build Step:**

```
git diff --quiet HEAD^ HEAD -- . ../../libs ../../package.json ../../pnpm-lock.yaml
```

Vercel runs this from the Root Directory (`apps/web`). Exit conventions: **0 = skip**, **1 = build**. `git diff --quiet` exits 0 when none of the listed paths changed in the last commit — backend-only commits (`apps/etl/**`, `Dockerfile`, etc.) won't trigger a Vercel build.

## 3. (Optional) Migrate a custom domain from another Vercel project

A custom domain can only be active on **one** Vercel project at a time. Cutover is sequential: remove from old → add to new. DNS records at the registrar **don't change** — they keep pointing at Vercel's edge; Vercel routes internally. ~30 sec downtime, no DNS propagation wait.

1. **Old project → Settings → Domains → Remove** the domain.
2. **New project → Settings → Domains → Add Domain** → enter the same domain → Add. SSL re-issues automatically (~10–60 sec).
3. Open the domain in incognito to confirm.

If verification stalls: `dig <domain> +short` — expected `cname.vercel-dns.com` or `76.76.21.21`. If something else, Vercel will show a TXT record to add at the registrar.

**Rollback:** remove from new, re-add on old. ~30 sec downtime.
