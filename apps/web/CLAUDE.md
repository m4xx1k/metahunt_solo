# `@metahunt/web` — Next.js 16 frontend

Imported from the standalone `metahunt-client` repo on 2026-05-03 — see [migration tracker](../../md/journal/migrations/frontend-migration.md) and [ADR-0005](../../md/journal/decisions/0005-vercel-for-frontend.md).

Routing & full project conventions: root [`/CLAUDE.md`](../../CLAUDE.md). This file only adds frontend-specific notes.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version (16.2.3 + React 19.2.4) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local dev

From repo root (preferred — sets up everything via the workspace):

```bash
pnpm dev:web     # web only
pnpm dev:etl     # etl only (also rebuilds @metahunt/database first)
pnpm dev         # both in parallel; needs `pnpm db:up` first for etl
pnpm build:web   # production build of web
pnpm lint:web    # lint web
```

The dev port for web is set in this package's `dev` script (currently `next dev --port=4000`); change it there if it conflicts. ETL listens on `PORT` from `.env` (default 3000).

## Deploy

Vercel builds from `apps/web/` of this monorepo (Root Directory setting). The Ignored Build Step skips Vercel when a commit doesn't touch `apps/web/`, `libs/`, or root manifests. Setup + domain-migration procedure: [`md/runbook/vercel-deploy.md`](../../md/runbook/vercel-deploy.md).

## API integration

Currently none — the landing is fully static, sourced from `lib/landing-data.tsx`. When the first endpoint is consumed, that ticket adds CORS to `@metahunt/etl`, declares `NEXT_PUBLIC_API_URL` on Vercel, and adds the typed fetch helper. See ADR-0005 consequences.
