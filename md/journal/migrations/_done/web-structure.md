# web-structure — co-locate landing sections, prepare for new pages

**Branch:** `refactor/web-structure` · **Started:** 2026-05-03 · **Closed:** 2026-05-03 · **Status:** done

## Outcome

Shipped on `c2562f6`. `app/(landing)/_components/{hero,problem,how,result,ai,roadmap,about,cta}/` co-locate sections + their bound molecules; `components/shared/` owns cross-page chrome; `components/ui-kit/` is primitives only. Dead code (`Audience`, `landing-data.tsx`, `PricingCard`, `SuccessCard`) deleted. The 3-tier rule below is the source of truth for adding new pages.

## The 3-tier rule

| Tier | Lives in | Used by | Knows about |
|---|---|---|---|
| **1 · Primitives** | `components/ui-kit/` | Anywhere | Nothing domain-specific |
| **2 · Cross-page** | `components/shared/`, `components/data/` | 2+ pages | Domain-shaped but page-agnostic |
| **3 · Page-private** | `app/(group)/<route>/_components/` | Exactly 1 page | Whatever it wants |

**Promotion rule:** start everything in tier 3. Promote to tier 2 only when a *second* page actually imports it (rule of three from `md/engineering/DESIGN.md`). Never start in tier 2 "just in case".

**Demotion rule:** if a tier-2 component loses its second consumer, move it back into the surviving page's `_components/` or delete it.

**API rule:** `lib/api/` is the only place that talks to the backend. Pages call typed fetchers from there; components stay dumb and receive data via props.

## Decisions

- **Route group `(landing)` over plain folder** — explicit named group makes the intent clear and gives a clean home for `(investigation)` later.
- **`_components/` (Next.js private folder convention)** over arbitrary `components/` inside `app/` — Next.js won't try to route into it.
- **`data.tsx` (not `.ts`)** — landing is static; allowing JSX in data lets icons stay rendered inline rather than introducing a string-name resolver layer with no benefit today.
- **`components/shared/`** for cross-page chrome — `components/layout/` was considered but `shared/` accommodates non-layout cross-cutting too (e.g. future `<UserMenu>`).
