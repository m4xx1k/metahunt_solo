# web-structure — co-locate landing sections, prepare for new pages

**Branch:** `refactor/web-structure` · **Started:** 2026-05-03 · **Status:** in-progress

## Why

`apps/web` is small today (landing only) but already pre-tangled. Symptoms:

- `lib/landing-data.tsx` is a 309-line "data" file that imports React, instantiates `<Icon/>` JSX, and hard-codes presentation tokens (`iconClass = "h-6 w-6"`). Adding a section means editing a global file.
- `components/ui-kit/cards/` exports 8 cards; 7 of them are bound to a single landing section (`ProblemCard`, `StepCard`, `RawJobCard`, `GoldenJobCard`, `FeatureCard` …). The "kit" boundary is blurry — primitives and section-molecules sit side by side.
- Several files are dead: `Audience.tsx` (commented out of `app/page.tsx`), `audienceSection` data, `PricingCard`/`SuccessCard` (only rendered as placeholders in the `/ui-kit` demo).
- More pages are coming next (RSS records, ingests, sources) with their own filters / sorting / pagination. Without an explicit boundary rule, those pages will pile cross-cutting widgets into `components/` and the structure will collapse into spaghetti.

## Goal

A structure where:

1. Each landing section owns its own data + section-bound molecules in one folder.
2. Cross-page primitives (true ui-kit) are clearly separated from page-private and cross-page composites.
3. Adding a new investigation page (rss-records, ingests, sources) follows the same pattern without inventing new conventions.

## The 3-tier rule

| Tier | Lives in | Used by | Knows about |
|---|---|---|---|
| **1 · Primitives** | `components/ui-kit/` | Anywhere | Nothing domain-specific |
| **2 · Cross-page** | `components/shared/`, `components/data/` | 2+ pages | Domain-shaped but page-agnostic |
| **3 · Page-private** | `app/(group)/<route>/_components/` | Exactly 1 page | Whatever it wants |

**Promotion rule:** start everything in tier 3. Promote to tier 2 only when a *second* page actually imports it (rule of three from `md/engineering/DESIGN.md`). Never start in tier 2 "just in case".

**Demotion rule:** if a tier-2 component loses its second consumer, move it back into the surviving page's `_components/` or delete it.

**API rule:** `lib/api/` is the only place that talks to the backend. Pages call typed fetchers from there; components stay dumb and receive data via props.

## Target structure

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── (landing)/
│   │   ├── page.tsx
│   │   └── _components/
│   │       ├── hero/{Hero.tsx, data.tsx}
│   │       ├── problem/{Problem.tsx, ProblemCard.tsx, data.tsx}
│   │       ├── how/{HowItWorks.tsx, StepCard.tsx, data.tsx}
│   │       ├── result/{Result.tsx, RawJobCard.tsx, GoldenJobCard.tsx, data.tsx}
│   │       ├── ai/{AiCopilot.tsx, FeatureCard.tsx, data.tsx}
│   │       ├── roadmap/{Roadmap.tsx, data.tsx}
│   │       ├── about/{AboutMe.tsx, data.tsx}
│   │       └── cta/{FinalCTA.tsx, FinalCTAForm.tsx, data.tsx}
│   ├── (investigation)/                  # added later, not in this refactor
│   │   ├── layout.tsx
│   │   ├── rss-records/{page.tsx, _components/}
│   │   ├── ingests/{page.tsx, _components/}
│   │   └── sources/{page.tsx, _components/}
│   └── ui-kit/page.tsx                   # demo page (kept at root for now)
├── components/
│   ├── ui-kit/                           # tier 1
│   │   ├── brand/Logo.tsx
│   │   ├── navigation/NavLink.tsx
│   │   ├── typography/{Heading,Text,Tag}.tsx
│   │   ├── buttons/{Button,IconButton}.tsx
│   │   ├── badges/Badge.tsx
│   │   ├── inputs/{EmailInput,SearchInput}.tsx
│   │   ├── icons/IconBox.tsx
│   │   ├── cards/Card.tsx                # base only
│   │   ├── layout/{Section,SectionHeader,Divider}.tsx
│   │   └── index.ts
│   ├── shared/                           # tier 2 — cross-page chrome
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   └── data/                             # tier 2 — created when 2nd data page needs it
└── lib/
    ├── api/                              # added when first endpoint is consumed
    └── utils.ts
```

## What moves where

### Out of `components/ui-kit/cards/` → into landing sections (tier 1 → tier 3)

| File | New home |
|---|---|
| `ProblemCard.tsx` | `app/(landing)/_components/problem/` |
| `StepCard.tsx` | `app/(landing)/_components/how/` |
| `RawJobCard.tsx` | `app/(landing)/_components/result/` |
| `GoldenJobCard.tsx` | `app/(landing)/_components/result/` |
| `FeatureCard.tsx` | `app/(landing)/_components/ai/` |

### Out of `components/sections/` → split by tier

| File | New home | Why |
|---|---|---|
| `Hero.tsx` | `app/(landing)/_components/hero/` | landing-private |
| `Problem.tsx` | `app/(landing)/_components/problem/` | landing-private |
| `HowItWorks.tsx` | `app/(landing)/_components/how/` | landing-private |
| `Result.tsx` | `app/(landing)/_components/result/` | landing-private |
| `AiCopilot.tsx` | `app/(landing)/_components/ai/` | landing-private |
| `Roadmap.tsx` | `app/(landing)/_components/roadmap/` | landing-private |
| `AboutMe.tsx` | `app/(landing)/_components/about/` | landing-private |
| `FinalCTA.tsx`, `FinalCTAForm.tsx` | `app/(landing)/_components/cta/` | landing-private |
| `Header.tsx` | `components/shared/` | tier 2 — every page |
| `Footer.tsx` | `components/shared/` | tier 2 — every page |
| `Section.tsx` | `components/ui-kit/layout/` | tier 1 — generic shell |
| `SectionHeader.tsx` | `components/ui-kit/layout/` | tier 1 — generic shell |

### Deletions (dead code)

- `components/sections/Audience.tsx` — commented out of `app/page.tsx`
- `audienceSection` from `lib/landing-data.tsx`
- `components/ui-kit/cards/PricingCard.tsx` — only rendered as a placeholder in `/ui-kit` demo
- `components/ui-kit/cards/SuccessCard.tsx` — only rendered as a placeholder in `/ui-kit` demo
- `lib/landing-data.tsx` — fully distributed into per-section `data.tsx` files

### Data layer

`lib/landing-data.tsx` is split into 8 per-section `data.tsx` files. Each section's `data.tsx` is allowed to contain JSX (the landing is fully static — no API call, no need to ship plain-JSON content). When a section *does* eventually call an API, it gets a `lib/api/<resource>.ts` fetcher; components still receive data as props.

## Migration order

Each step keeps the build green so we can stop and pick up cleanly.

1. **Scaffold** — create empty `app/(landing)/page.tsx`, `app/(landing)/_components/<8 dirs>/`, `components/shared/`. Old `app/page.tsx` keeps working unchanged.
2. **Move sections section-by-section** — for each of `hero`, `problem`, `how`, `result`, `ai`, `roadmap`, `about`, `cta`:
   1. Move section component + its bound cards into `_components/<name>/`.
   2. Cut its slice from `lib/landing-data.tsx` into a local `data.tsx`.
   3. Update imports in the new `app/(landing)/page.tsx`.
3. **Switch the route** — delete old `app/page.tsx`. The `(landing)` group now serves `/`.
4. **Move Header/Footer** to `components/shared/`. Update imports.
5. **Move `Section`/`SectionHeader`** to `components/ui-kit/layout/`. Update imports.
6. **Audit + delete** — `Audience.tsx`, `audienceSection`, `PricingCard.tsx`, `SuccessCard.tsx`, `lib/landing-data.tsx`.
7. **Update barrel** — `components/ui-kit/index.ts` drops removed cards, gains `layout/Section`, `layout/SectionHeader`.
8. **Update `/ui-kit` demo** — drop `PricingCard`/`SuccessCard` references; cards section in the demo now shows only what's still in the kit.
9. **Encode conventions** — add the 3-tier rule to `apps/web/CLAUDE.md` so the next page added doesn't relitigate this.
10. **Verify** — `pnpm build:web` and `pnpm lint:web` clean.

## Out of scope

- API integration for any page (separate ticket; `lib/api/` is created when the first endpoint is consumed).
- The investigation pages themselves (`rss-records`, `ingests`, `sources`) — this refactor only documents *where they will live* and prepares the structure.
- Collapsing `Section` + `SectionHeader` into one composer — explicitly deferred (some sections, e.g. `AboutMe`, don't use `SectionHeader`; keeping them as two pieces preserves flexibility).
- Visual/design changes — purely structural.

## Decisions

- **Route group `(landing)` over plain folder** — explicit named group makes the intent clear and gives a clean home for `(investigation)` later.
- **`_components/` (Next.js private folder convention)** over arbitrary `components/` inside `app/` — Next.js won't try to route into it.
- **`data.tsx` (not `.ts`)** — landing is static; allowing JSX in data lets icons stay rendered inline rather than introducing a string-name resolver layer with no benefit today.
- **Lowercase folder names + PascalCase component files** — matches Next.js community convention.
- **`components/shared/`** for cross-page chrome — `components/layout/` was considered but `shared/` accommodates non-layout cross-cutting too (e.g. future `<UserMenu>`).
