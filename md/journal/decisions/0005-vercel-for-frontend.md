# ADR-0005 — Frontend lives in the monorepo, ships to Vercel

**Status:** accepted
**Date:** 2026-05-03
**Context (in time):** Stage 04 (parallel — does not block ETL work)

## Context

The Next.js client lived in its own GitHub repo (`maxxik2004/metahunt-client`) wired to its own Vercel project. Backend (`@metahunt/etl`) lives in this monorepo and ships to Railway. Two repos for one product creates friction: cross-cutting changes become two PRs in two places, no shared types, two CLAUDE.md / agent setups.

We need to decide where the frontend lives and how it ships. Both Vercel and Railway support deploying from a subset of a monorepo, so deploy isolation is mechanically possible.

## Options

### Option A — Keep frontend in its own repo, deploy independently
- ✅ zero migration cost
- ❌ cross-cutting changes split across two repos; no shared types; two agent contexts

### Option B — Bring frontend into monorepo as `apps/web`, ship to Vercel; ETL stays on Railway
- ✅ one PR for cross-cutting changes; room to share types later via `libs/contracts`; one agent context
- ✅ deploy isolation preserved by `Root Directory` + `Ignored Build Step` (Vercel) and `watchPatterns` + selective Dockerfile (Railway)
- ❌ initial migration work

### Option C — Bring frontend into monorepo, also collapse backend to Vercel functions
- ❌ wrong shape for our backend (Temporal workers need a long-running process; Postgres pool wants reuse); months of rewrite for a deployment cosmetics win

## Decision

**Option B.** The deploy-isolation concern that historically pushed teams to keep frontend and backend in separate repos is solved by tooling on both sides — Vercel's `Root Directory` + `Ignored Build Step`, Railway's `watchPatterns` + selective `Dockerfile`. The remaining benefits all favor consolidation.

We deliberately **do not** wire any API integration as part of this work. The frontend ships exactly as it does today (statically-rendered landing from `landing-data.tsx`); when the first endpoint it consumes lands, that ticket adds CORS to ETL, declares `NEXT_PUBLIC_API_URL` on Vercel, and writes the typed fetch helper — all in one place reviewed against actual usage. Splitting `apps/api` out of `apps/etl` is even further out, triggered only by ETL getting too crowded.

## Consequences

- **One PR for cross-cutting changes.** A schema/API/UI change can ship together.
- **Vercel project.** A new Vercel project owns `apps/web/` of this monorepo (`Root Directory = apps/web`, `Install Command = cd ../.. && pnpm install --frozen-lockfile`, `Ignored Build Step` skips backend-only commits). Custom domain migrated from the old standalone-repo project in a sequential cutover. Procedure: [`md/runbook/vercel-deploy.md`](../../runbook/vercel-deploy.md).
- **Railway untouched.** `railway.json watchPatterns` lists only `apps/etl/**` + `libs/**` + root manifests; the Dockerfile copies only `apps/etl/dist/` + `libs/database/dist/`. Frontend commits don't trigger Railway.
- **CORS, `NEXT_PUBLIC_API_URL`, fetch helpers — none here.** This migration is no-behaviour-change. The first real consumer ticket adds them together.
- **No shared types lib yet.** When the first endpoint is added, evaluate: hand-write on both sides if one-off; introduce `libs/contracts` if it grows.
- **`apps/api` split** is a future migration, triggered by ETL getting crowded — not promised by this ADR.
