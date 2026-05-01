# ADR-0002 — ETL as an HTTP server instead of a headless app

**Status:** accepted
**Date:** 2026-04-26
**Context (in time):** Stage 01

## Context

The initial `apps/etl` scaffold was headless: `NestFactory.createApplicationContext(AppModule)` — DI container only, no HTTP server. Semantically that's a clean fit for ETL: a background process triggered by cron / a Temporal worker, runs, then exits.

Question: keep it headless, or wrap it in an HTTP server.

## Options

### Option A — keep headless
- ✅ most accurately reflects the nature of ETL (background work, not a server)
- ✅ fewer dependencies (no `@nestjs/platform-express`)
- ❌ no health-check / metrics endpoint — harder to monitor in prod
- ❌ harder to poke by hand from a browser / curl
- ❌ Nest CLI dev mode (`nest start --watch`) works, but without a live endpoint it's harder to see whether the app actually started

### Option B — full HTTP (Express)
- ✅ native `/health`, `/metrics`, admin endpoints when needed
- ✅ trivial smoke test: `curl http://localhost:3000`
- ✅ `nest start --watch` is more pleasant — there's a live process to restart
- ❌ pulls in `@nestjs/platform-express`
- ❌ ETL becomes "server-shaped" — real ETL jobs will need to run via `@nestjs/schedule` inside the process, or be split out into a separate app

### Option C — hybrid: HTTP server + ETL via `@nestjs/schedule`
- same as B, but with a cron scheduler under the hood

## Decision

**Option B for now.** At scaffold stage, having a quick smoke test and a live endpoint for onboarding matters more than semantic purity. `GET /` currently serves the greeting from the lib — a canary that proves DI works across workspaces.

When we hit real ETL jobs (Stage 04+) we'll revisit:
- if jobs are few and infrequent — grow into Option C (`@nestjs/schedule` inside the HTTP app)
- if many / heavy — split workers into a separate app (`apps/worker`, e.g. on Temporal), keep `etl` as the admin/monitor surface

## Consequences

- `apps/etl` listens on `PORT` (default `3000`).
- `GET /` returns `{ greeting }` from the database lib — currently the only endpoint.
- `/health`, `/metrics` slot in naturally later.
- If we ever go back to headless, we rewrite `main.ts` to use `createApplicationContext` and lift the runner logic into a CLI / cron. This ADR will then be superseded by a new one.
