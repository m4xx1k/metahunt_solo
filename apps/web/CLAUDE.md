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
| **shared** | `ui/`, `lib/` | Domain-free primitives, charts, api client, utils, hooks | nothing above |
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
    [[...slug]]/page.tsx           # public feed (catch-all: /, /track/<slug>…)
    _components/                   # feed-owned only: market/ (FeedHero,
                                   #   FeedFilters, toggles), pipeline/,
                                   #   subscribe/, vacancy-list/
  welcome/                         # marketing landing (/welcome)
    page.tsx
    _components/<section>/         # one folder per static section: hero, how,
      <Section>.tsx                #   problem, result, ai, roadmap, about,
      data.tsx                     #   cta, waitlist — content, NOT features
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
ui/                                # shared domain-free primitives
  badges/ buttons/ cards/ charts/ icons/ inputs/ layout/ navigation/ typography/
lib/
  api/                             # typed fetchers — the only backend boundary
  hooks/  utils.ts  format.ts  extracted-vacancy.ts
```

**`_components` is not a junk drawer — it's an ownership claim.** Each `_components` folder belongs to exactly one route (the `_` prefix is Next's opt-out of routing). The moment a second page imports from another page's `_components`, that import is the promotion signal: move the thing to `entities`/`features`/`ui` instead. Two pages sharing one `_components` folder (how welcome + feed used to share `(feed)/_components`) is the bug this rule exists to catch.

**Sparse layers are fine.** `features/` having one slice and `ui/` being small is expected at this stage — layers earn tenants through the promotion rule, they are not filled for symmetry.

**Where does new code go (decision list):**

1. Used by one page → that page's `_components/` (or a section folder under `welcome/_components/`).
2. Needed on a second page and it *displays a domain noun* (vacancy, skill, source…) → `entities/<noun>/`.
3. Needed on a second page and it *does something* (state, url-sync, mutation flow) → `features/<capability>/`.
4. Domain-free and reusable anywhere (button, chart, layout shell) → `ui/`.
5. Talks to the backend → a typed fetcher in `lib/api/`, never inside a component.

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

Browser extensions mutate `<html>`/`<body>` before React hydrates, causing spurious hydration-mismatch errors. Two guards keep the dev terminal clean: `app/layout.tsx` sets a *shallow* `suppressHydrationWarning` on `<html>` and `<body>` (deeper mismatches still surface), and `next.config.ts` sets `logging.browserToTerminal: false`. Flip the latter to `'warn'` temporarily if you need client logs — don't commit it.

## Deploy

Vercel builds from `apps/web/` of this monorepo (Root Directory setting). The Ignored Build Step skips Vercel when a commit doesn't touch `apps/web/`, `libs/`, or root manifests. Setup + domain-migration procedure: [`md/runbook/vercel-deploy.md`](../../md/runbook/vercel-deploy.md).

## API integration

`lib/api/` is the single backend boundary: one typed fetcher per resource, all going through the shared `lib/api/client.ts` (`apiBase` + `apiFetch` + `buildQs`). Pages (server components) call the fetchers and pass data as props; components stay dumb. `NEXT_PUBLIC_API_URL` must point at `@metahunt/etl` (set in `.env.local` locally, on Vercel for deploys). The welcome landing is fully static; the feed page is live (market filters + vacancy list); investigation pages are fully API-driven. See ADR-0005 consequences.
