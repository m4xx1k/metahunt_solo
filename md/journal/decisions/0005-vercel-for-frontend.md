# ADR-0005 — Frontend lives in the monorepo, ships to Vercel

**Status:** accepted
**Date:** 2026-05-03
**Context (in time):** Stage 04 (parallel — does not block ETL work)

## Context

The Next.js client at `~/projects/metahunt-client/` is a standalone GitHub repo connected to its own Vercel project. The backend (`@metahunt/etl`) lives in this monorepo and ships to Railway. Two repos for one product creates friction: cross-cutting changes ("frontend reads new API field") become two PRs in two places, no shared types, two independent CI surfaces, two independent agent setups (CLAUDE.md / `.claude/` configs).

We need to decide: **where does the frontend live, and how does it ship?** Both Vercel and Railway already work from monorepo subsets — Vercel via "Root Directory" + Ignored Build Step, Railway via `railway.json watchPatterns` + selective `Dockerfile` copies — so deploy isolation is mechanically possible.

## Options

### Option A — Keep frontend in its own repo, deploy independently
- ✅ zero migration cost
- ✅ existing Vercel project keeps working untouched
- ❌ cross-cutting changes are split across two PRs in two repos
- ❌ no shared types when API and frontend agree on a contract
- ❌ two CLAUDE.md / agent setups to maintain
- ❌ contributors hold two checkouts; agents see only half the system at any time

### Option B — Bring frontend into monorepo as `apps/web`, ship to Vercel; ETL stays on Railway
- ✅ one PR for cross-cutting changes
- ✅ shared types possible later via a `libs/contracts` lib (not done now — YAGNI)
- ✅ one agent context covers the whole product
- ✅ deploy isolation preserved: Vercel rebuilds only on `apps/web/` + shared changes; Railway rebuilds only on `apps/etl/**` + `libs/**`
- ❌ initial migration work (this ADR's parent tracker)
- ❌ Vercel project must be repointed (manual UI step)

### Option C — Bring frontend into monorepo, also collapse backend to Vercel (serverless functions)
- ✅ single platform for everything
- ❌ Vercel functions are not the right shape for our backend: Temporal workers need a long-running process; Postgres pool wants connection reuse; BAML/OpenAI calls have latency that fights the function timeout model; the existing Dockerfile + Railway healthcheck setup just works
- ❌ a months-long rewrite for a deployment cosmetics win

## Decision

We pick **Option B**.

**Rationale:** the deploy-isolation concern that historically pushed teams to keep frontend and backend in separate repos is solved by tooling on both sides. Vercel's "Root Directory" + "Ignored Build Step" gives us a build that ignores backend commits; Railway's `watchPatterns` + a selective `Dockerfile` gives us a build that ignores frontend commits. The remaining benefits — single PR, single context, room to share types — all favor consolidation.

We deliberately **do not** wire any API integration as part of this work. The frontend ships exactly as it does today (statically-rendered landing from `landing-data.tsx`); when the first endpoint it consumes lands, that ticket will add CORS to ETL, declare `NEXT_PUBLIC_API_URL` on Vercel, and write the typed fetch helper — all in one place where it can be reviewed against actual usage. Splitting `apps/api` out of `apps/etl` is even further out, triggered only by ETL getting too crowded to mix "ingestion worker" with "user-facing API".

## Consequences

- **One PR for cross-cutting changes.** "Add `engagementType` to job listing" can change the BAML schema, the DB row, the API endpoint, and the frontend display in one commit.
- **Vercel project is repointed** from the old standalone repo to this monorepo with `Root Directory = apps/web`. The old GitHub repo is archived (read-only) once the new deploy is green.
- **Backend (Railway) is unaffected by frontend commits.** Verified via `railway.json watchPatterns` (lists only `apps/etl/**` + `libs/**` + root configs) and Dockerfile (copies only `apps/etl/` + `libs/database/`). Defense in depth: `apps/web` added to `.dockerignore`.
- **Frontend (Vercel) is unaffected by backend commits.** Verified via Vercel "Ignored Build Step" that diffs `apps/web/` + `libs/` + root manifests; backend-only commits skip the build.
- **CORS, `NEXT_PUBLIC_API_URL`, fetch helpers — none of this is set up here.** This migration is a no-behaviour-change move; the moment the first endpoint becomes a thing, a follow-up ticket will (a) add `CORS_ORIGINS` env + `app.enableCors(...)` to ETL, (b) declare `NEXT_PUBLIC_API_URL` on Vercel per environment, (c) add the typed fetch helper. Doing it then keeps the diff focused on a real consumer rather than guessing at one.
- **No shared types lib yet.** When the first endpoint is added, we evaluate: if the contract is one-off, hand-write the type on both sides; if it grows, introduce `libs/contracts` (zod or BAML or plain TS).
- **`apps/api` is a future migration**, not promised by this ADR. Triggered by ETL getting too crowded, not by anything in this work.
