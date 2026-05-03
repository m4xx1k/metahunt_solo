# `@metahunt/web` — Next.js 16 frontend

Routing & full project conventions: root [`/CLAUDE.md`](../../CLAUDE.md). This file only adds frontend-specific notes. Why this app lives in the monorepo: [ADR-0005](../../md/journal/decisions/0005-vercel-for-frontend.md).

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version (16.2.3 + React 19.2.4) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Structure — the 3-tier rule

| Tier | Lives in | Used by | Knows about |
|---|---|---|---|
| **1 · Primitives** | `components/ui-kit/` | Anywhere | Nothing domain-specific |
| **2 · Cross-page** | `components/shared/`, `components/data/` | 2+ pages | Domain-shaped but page-agnostic |
| **3 · Page-private** | `app/(group)/<route>/_components/` | Exactly 1 page | Whatever it wants |

**Promotion:** start in tier 3. Promote to tier 2 only when a *second* page actually imports it (rule of three from `md/engineering/DESIGN.md`). Never start in tier 2 "just in case".

**Demotion:** if a tier-2 component loses its second consumer, move it back into the surviving page's `_components/` or delete it.

**API:** `lib/api/` is the only place that talks to the backend. Pages call typed fetchers; components stay dumb and receive data via props.

## Layout

```
app/
  layout.tsx                       # root: html, body, fonts, analytics
  (landing)/
    page.tsx                       # /
    _components/<section>/         # one folder per section
      <Section>.tsx
      data.tsx                     # section's content (JSX-OK; landing is static)
      <Card>.tsx                   # section-bound molecules go HERE, not in ui-kit
  (investigation)/                 # internal data pages (rss-records, ingests, sources)
    layout.tsx
    <route>/
      page.tsx
      _components/                 # page-private components, filters, columns, etc
  ui-kit/page.tsx                  # /ui-kit demo
components/
  ui-kit/                          # tier 1 — primitives only
  shared/                          # tier 2 — Header, Footer, future SidebarNav
  data/                            # tier 2 — DataTable, Pagination, FilterPanel (created when needed)
lib/
  api/                             # typed fetchers (created when first endpoint is consumed)
  utils.ts
```

**Rules of thumb:**

- Adding a landing section → new folder under `app/(landing)/_components/<name>/` with `<Name>.tsx` + `data.tsx` + any section-bound cards. Import in `app/(landing)/page.tsx`.
- Adding an investigation page → `app/(investigation)/<route>/page.tsx` (server component) calls `lib/api/<resource>.ts`, passes data as props to `_components/`.
- A "card" or widget used by exactly one page does NOT belong in `components/ui-kit/`. Put it next to its consumer.
- Need something on two pages → move to `components/shared/` (chrome) or `components/data/` (data widgets).

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

Currently none — the landing is fully static, sourced from per-section `data.tsx` files under `app/(landing)/_components/`. When the first endpoint is consumed, that ticket adds CORS to `@metahunt/etl`, declares `NEXT_PUBLIC_API_URL` on Vercel, creates `lib/api/client.ts` + a typed fetcher per resource, and the consuming page calls it. See ADR-0005 consequences.
