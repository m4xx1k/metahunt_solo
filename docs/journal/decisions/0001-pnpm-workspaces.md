# ADR-0001 — pnpm workspaces instead of NestJS CLI monorepo

**Status:** accepted
**Date:** 2026-04-26
**Context (in time):** Stage 01

## Context

The first monorepo attempt (`/home/user/plan-a/_metahunt/`) used the NestJS CLI monorepo: one root `package.json`, apps/libs under `apps/`/`libs/`, but the layout is driven by `nest-cli.json`. Quick to set up, but it doesn't scale — the shared `package.json` mixes deps from all projects, versions drift, and the lib can't be published independently without surgery.

We want a structure where each package is isolated and explicitly declares its own dependencies.

## Options

### Option A — NestJS CLI monorepo (status quo)
- ✅ `nest build` and `nest start` work natively
- ✅ no extra setup needed
- ❌ a single root `package.json` — a stew of deps from all packages
- ❌ no native workspace protocol; the lib doesn't look like a real package
- ❌ once a second app shows up, dep versions start to clash

### Option B — pnpm workspaces
- ✅ each package = its own `package.json`, its own deps
- ✅ native `workspace:*` protocol — the lib could be published almost as-is later
- ✅ isolation via symlinks under `node_modules/.pnpm/`
- ❌ a bit more boilerplate (a `package.json` + `tsconfig.json` per package)
- ❌ build ordering between packages has to be managed manually

### Option C — Nx / Turborepo
- ✅ task graph, build cache, dep graph out of the box
- ❌ heavy toolchain lock-in
- ❌ overkill for two packages

## Decision

**Option B — pnpm workspaces.** Fits the current scale (1 app + 1 lib, +1–2 more later), doesn't introduce another toolchain, and keeps the door open for publishing libs. Build order is handled manually via `pnpm --filter` or `pnpm -r --workspace-concurrency=1` — fine while the package count is small.

If the dep graph grows and `pnpm -r` becomes a bottleneck, we'll move to Turborepo (on top of the same pnpm workspaces, so no rewrite of the structure).

## Consequences

- The old `_metahunt/` stays as a read-only reference — we don't import anything from it.
- Each new package has its own `package.json` with `"name": "@metahunt/<slug>"`.
- Inter-package deps go through `workspace:*`, never relative paths.
- The `@metahunt/database` lib must be built into `dist/` — the app resolves it via `main: dist/index.js`.
- Dev mode requires two watch processes (`tsc -w` in the lib + `nest start --watch` in the app), because the Nest watcher doesn't look inside `node_modules`.
