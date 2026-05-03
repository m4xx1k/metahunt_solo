# Runbook — Reconnect Vercel project from `metahunt-client` to monorepo

**Audience:** the person who owns the Vercel project (only the project owner can change Git source). Designed to be doable from a phone.

**When to do this:** after PR `feat/frontend-migration` is merged to `main` (or against a Preview build of that PR if you want to test before merge).

**Pre-flight:**
- The monorepo has `apps/web/` populated and `pnpm install` works at the root.
- You have admin access to the existing Vercel project that today points at `maxxik2004/metahunt-client`.
- You have the Railway production URL of `@metahunt/etl` ready (you'll paste it as `NEXT_PUBLIC_API_URL`).

## Steps

### 1. Disconnect old Git source

1. Vercel Dashboard → Projects → **metahunt-client** (or whatever the project is named).
2. **Settings → Git**.
3. **Disconnect** the `maxxik2004/metahunt-client` repo.

> Vercel keeps deployment history but stops auto-deploying. The currently-live Production URL keeps serving until you trigger a new deploy.

### 2. Connect monorepo

1. Same screen → **Connect Git Repository**.
2. Pick the monorepo (`<owner>/metahunt`).
3. **Production Branch:** `main`.

### 3. Set Root Directory

1. **Settings → Build & Development Settings**.
2. **Root Directory:** `apps/web` → **Save**.

> Without this, Vercel tries to build the monorepo root and fails (no Next.js detected at root).

### 4. Set Install Command

Same screen → **Install Command**: paste exactly:

```
cd ../.. && pnpm install --frozen-lockfile
```

> Reason: pnpm workspaces only resolve correctly when install runs from the workspace root, not from `apps/web/`.

### 5. (Leave Build Command blank — Vercel auto-detects `next build`.)

### 6. Set Ignored Build Step

**Settings → Git → Ignored Build Step**: paste exactly:

```
git diff --quiet HEAD^ HEAD -- . ../../libs ../../package.json ../../pnpm-lock.yaml
```

> Vercel runs this from the Root Directory (`apps/web`), so `.` means `apps/web/`. Exit code conventions: **0 = skip the build**, **1 = build**. `git diff --quiet` exits 0 when there are no differences in the listed paths — exactly what we want when a commit only touched backend files (`apps/etl/**`, `Dockerfile`, etc.). On the very first deployment after reconnect (no `HEAD^`), Vercel falls back to building, which is correct.

### 7. Add environment variables

**Settings → Environment Variables** → add:

| Name | Production value | Preview value | Development value |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<railway-prod-domain>` | same (or staging URL if you have one) | `http://localhost:3000` |

> `NEXT_PUBLIC_*` is exposed to the browser at build time — this is how the frontend learns where the backend lives.

### 8. Update Railway `CORS_ORIGINS`

This step is on **Railway**, not Vercel. Go to your Railway service env vars and set:

```
CORS_ORIGINS=https://<your-custom-domain-if-any>,https://<your-vercel-prod-url>.vercel.app
```

For Preview deployments, Vercel gives URLs like `metahunt-client-<hash>.vercel.app`. To allow all preview URLs without enumerating them, you can add a wildcard pattern in your CORS handler (the env var supports comma-separated origins; the Nest `enableCors` accepts a function/regex if needed — not configured by default in T2). For now, add specific URLs as you encounter them.

### 9. Trigger a deployment

- **From the PR (recommended for first test):** push any commit to `feat/frontend-migration` (or just open a new commit-less deployment from Vercel's "Deployments" tab → "Redeploy"). Vercel builds the Preview against `apps/web/` of the PR branch.
- **From `main`:** if PR is already merged, Vercel auto-deploys Production.

### 10. Verify

1. Open the Vercel Production URL. Landing renders.
2. Browser DevTools → Console → run:
   ```js
   fetch(`${process.env.NEXT_PUBLIC_API_URL}/healthz`).then(r => r.json()).then(console.log)
   ```
   Expected: `{ status: "ok", postgres: { ok: true, ... }, ... }`. If you see a CORS error, double-check Railway's `CORS_ORIGINS` includes the exact origin you're calling from.
3. Check the Railway dashboard — no new deployment was triggered by this PR (the Vercel-side change should not bounce the backend).

### 11. Archive old repo

Once steps 9 and 10 are green:

1. GitHub → `maxxik2004/metahunt-client` → **Settings → Danger Zone → Archive this repository**.
2. The repo becomes read-only. Vercel deployments from before disconnect remain visible in history.

## Rollback

If anything in steps 1–10 breaks:

1. **Settings → Git → Disconnect** from monorepo.
2. **Settings → Git → Connect** back to `maxxik2004/metahunt-client`, branch `main` (or whatever it was).
3. **Settings → Build & Development Settings → Root Directory:** clear it (back to repo root).
4. **Settings → Build & Development Settings → Install Command:** clear it (back to default).
5. **Settings → Git → Ignored Build Step:** clear it.
6. Trigger a redeploy from Vercel Deployments tab. The old setup is restored.

The old GitHub repo was deliberately not archived until after step 10 — this rollback is always available.
