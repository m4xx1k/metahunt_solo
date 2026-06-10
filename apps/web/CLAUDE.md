# `@metahunt/web` — Next.js 16 frontend

Routing & full project conventions: root [`/CLAUDE.md`](../../CLAUDE.md). This file only adds frontend-specific notes. Why this app lives in the monorepo: [ADR-0005](../../md/journal/decisions/0005-vercel-for-frontend.md).

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version (16.2.3 + React 19.2.4) has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Structure — light-FSD layers

Background + full rationale: [`md/journal/migrations/front-refactor/rules.md`](../../md/journal/migrations/front-refactor/rules.md).

| Layer | Lives in | Contains | Imports from |
|---|---|---|---|
| **shared** | `components/ui-kit/`, `lib/` | Domain-free primitives, charts, api client, utils, hooks | nothing above |
| **entities** | `entities/<noun>/` | Domain nouns: types re-exports, pure formatters, dumb display components (VacancyCard, SkillChip) | shared |
| **features** | `features/<capability>/` | Domain verbs: UI + client/url state + adapter types (vacancy-filters) | entities, shared |
| **app** | `app/` | Routes = composition roots; server components fetch via `lib/api` and inject data via props | everything |

**Imports point down only.** A feature never imports another feature; cross-feature composition happens in `app/`. One sanctioned horizontal edge: `entities/vacancy` may import `entities/skill`/`entities/source` (the vacancy card naturally renders skill chips).

**Promotion:** everything starts page-private in `app/<route>/_components/` (or a landing section folder). Promote into `entities`/`features` when a second page imports it, or when it's an obvious domain noun/verb already being duplicated. Demote when the second consumer disappears. Never start in `entities`/`features` "just in case".

**Variants via slots/composition, never forks.** Need "the same card plus an overlay" → wrap it (see reverse-ATS `MatchCard`) or add a slot prop. Copy-pasting a card into a second file is a bug.

**API:** `lib/api/` is the only place that talks to the backend, all through `lib/api/client.ts` (`apiBase`/`buildQs`/`apiGet`/`apiPost`). Pages call typed fetchers; components stay dumb and receive data via props. DTO types live in `lib/api/*`; entities re-export what they need.

**Hooks:** file names are kebab-case `use-x.ts`; the export stays camelCase `useX`. Page-private hooks live in `<route>/_hooks/`; a feature's hook co-locates in the feature folder; a hook shared across routes with no feature home goes in `lib/hooks/`.

**Anti-ceremony:** no `ui/model/api` segments inside a slice until it hurts (>~6 files); no new barrel `index.ts` files — import directly per file; `use client` goes on leaves (a toggle, a button), not on whole sections; no duplicate component file names across layers.

## Layout

```
app/
  layout.tsx                       # root: html, body, fonts, analytics
  _components/                     # app chrome: Header, Footer, AppToaster
  (feed)/
    [[...slug]]/page.tsx           # public feed + landing
    _components/<section>/         # one folder per landing section — static
      <Section>.tsx                #   content, NOT features; stays colocated
      data.tsx                     #   forever (hero, how, pipeline, problem…)
  (investigation)/                 # internal data pages
    layout.tsx
    <route>/
      page.tsx                     # server component, fetches lib/api
      _components/                 # page-private components, columns, etc
  reverse-ats/                     # CV-match page + its private components
entities/
  vacancy/                         # VacancyCard, SeniorityBadge, DuplicatesBadge,
                                   #   Fact, FlagPill(s), format-locations
  skill/                           # SkillChip
features/
  vacancy-filters/                 # filter sections + adapter types + use-url-filters,
                                   #   consumed by the feed and reverse-ATS
components/
  ui-kit/                          # shared primitives only (+ charts/, navigation/)
lib/
  api/                             # typed fetchers — the only backend boundary
  hooks/  utils.ts  format.ts  extracted-vacancy.ts
```

**Rules of thumb:**

- Adding a landing section → new folder under `app/(feed)/_components/<name>/` with `<Name>.tsx` + `data.tsx`. Import in the feed page.
- Adding an investigation page → `app/(investigation)/<route>/page.tsx` (server component) calls `lib/api/<resource>.ts`, passes data as props to `_components/`.
- A card/widget used by exactly one page does NOT belong in `ui-kit`/`entities`. Put it next to its consumer.
- Needed on two pages → `entities/` if it's a domain noun's display, `features/` if it carries state/behavior, `ui-kit` if it's domain-free.

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

### Dev-server noise (hydration / browser logs)

Browser extensions (Grammarly, password managers, dark-reader…) mutate `<html>`/`<body>` attributes before React hydrates, producing spurious hydration-mismatch errors. Two guards keep the dev terminal clean:

- `app/layout.tsx` sets `suppressHydrationWarning` on `<html>` **and** `<body>` — silences the root cause. It's *shallow* (only those two elements' own attributes), so real mismatches deeper in the tree still surface.
- `next.config.ts` sets `logging.browserToTerminal: false` (Next 16.2+) so client console output is never forwarded to `pnpm dev:web`, regardless of the upstream default.

If you ever need client logs in the terminal for a debugging session, flip `browserToTerminal` to `'warn'`/`true` temporarily — don't commit it.

## Deploy

Vercel builds from `apps/web/` of this monorepo (Root Directory setting). The Ignored Build Step skips Vercel when a commit doesn't touch `apps/web/`, `libs/`, or root manifests. Setup + domain-migration procedure: [`md/runbook/vercel-deploy.md`](../../md/runbook/vercel-deploy.md).

## API integration

`lib/api/` is the single backend boundary: one typed fetcher per resource, all going through the shared `lib/api/client.ts` (`apiBase` + `apiFetch` + `buildQs`). Pages (server components) call the fetchers and pass data as props; components stay dumb. `NEXT_PUBLIC_API_URL` must point at `@metahunt/etl` (set in `.env.local` locally, on Vercel for deploys). The landing is static apart from the live market-snapshot + vacancy-list sections; investigation pages are fully API-driven. See ADR-0005 consequences.
