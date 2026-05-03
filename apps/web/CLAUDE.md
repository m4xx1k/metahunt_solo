# `@metahunt/web` — Next.js 16 frontend

Imported from the standalone `metahunt-client` repo on 2026-05-03 — see [migration tracker](../../md/journal/migrations/frontend-migration.md) and [ADR-0005](../../md/journal/decisions/0005-vercel-for-frontend.md).

Routing & full project conventions: root [`/CLAUDE.md`](../../CLAUDE.md). This file only adds frontend-specific notes.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version (16.2.3 + React 19.2.4) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local dev

```bash
pnpm --filter @metahunt/web dev    # http://localhost:4000
pnpm --filter @metahunt/web build
```

Or from root: `pnpm dev` runs every workspace's `dev` script in parallel — etl on `:3000`, web on `:4000`.

## Deploy

Vercel builds from `apps/web/` of this monorepo (Root Directory setting). The Ignored Build Step skips Vercel when a commit doesn't touch `apps/web/`, `libs/`, or root manifests. See [`md/runbook/vercel-reconnect.md`](../../md/runbook/vercel-reconnect.md).

## API integration

Currently none — the landing is fully static, sourced from `lib/landing-data.tsx`. When the first endpoint is consumed, that ticket adds CORS to `@metahunt/etl`, declares `NEXT_PUBLIC_API_URL` on Vercel, and adds the typed fetch helper. See ADR-0005 consequences.
