# Audit apps/web — findings (2026-06-10)

Scope: 162 ts/tsx files, ~12.9k lines. `app/(feed)/_components` — 50 files.

## 1. Vacancy cards — main duplication

Four cards: `components/data/PublicVacancyCard` (326 lines, largest frontend file),
`app/(investigation)/vacancies/_components/VacancyCard` (269 lines),
`app/reverse-ats/_components/MatchCard`, `app/(investigation)/_components/RssRecordCard` (321 lines).

Concrete duplicates between PublicVacancyCard and investigation VacancyCard:

| What | PublicVacancyCard | VacancyCard (investigation) |
|---|---|---|
| Locations | `formatLocationsCapped` (country parsing, +N overflow) | **different** `formatLocations` (no country) |
| Skill chips | inline JSX `border-accent / border-border` ×2 | own `SkillsRow` with same classes |
| Fact block | private `SidebarFact` | imports shared `_components/Fact` |
| Test/reserve pills | private `FlagPill` | shared `_components/FlagPills` |
| Meta row | `metaItems` array with labels | own `MetaTags` from same labels |

Both pull the same labels/formatters from `lib/extracted-vacancy` — **data is shared,
JSX is copied**. Styling is intentionally different (feed is strict, investigation has shadows),
but skill chips/locations/facts are identical in substance.

**Positive:** `MatchCard` does NOT fork — it wraps `PublicVacancyCard` with an overlay
(fit-tier + skill-diff). This is a ready example of the slot/compositor pattern.

`RssRecordCard` is a separate world (raw RSS record, not a vacancy) — stays in place.

## 2. components/data — dumping ground with no criterion

| File | Consumers | Verdict |
|---|---|---|
| PublicVacancyCard | VacancyList (feed), MatchCard (reverse-ats) | → `entities/vacancy`, legit 2 consumers |
| SeniorityBadge | 4 (feed card, 2× investigation, records page) | → `entities/vacancy` |
| DuplicatesBadge | **1** — only PublicVacancyCard | → `entities/vacancy`, next to the card |
| Pagination | 4 (feed, reverse-ats, 2× investigation) | generic UI → `ui-kit` |
| Donut | **1** — taxonomy VerifiedDonut | violates promotion rule → ui-kit/charts or demote |
| Sparkline | 2 (sources, dashboard) | → ui-kit/charts (domain-agnostic) |
| StackedBar | **1** — taxonomy AxisBar | same as Donut |
| filters/* | feed + reverse-ats | → `features/vacancy-filters` (see §3) |

Conclusion: "data" mixes 3 categories — domain components (entities), charts (shared/ui),
generic UI (ui-kit). The "data" label says nothing → delete the folder entirely.

## 3. Filters — layering correct, homes wrong

Reality is better than expected: layering already exists —

- `components/data/filters/` = primitives + adapter types (`FilterAggregates`,
  `FilterState`, `pillClass/chipClass`, Section, EnumSection, PerksFilter). The comment in
  `types.ts` explicitly describes the adapter pattern: "any consumer maps its own source into these
  shapes via an adapter" — this is FSD public-api in the wild.
- `app/(feed)/_components/market-snapshot/filters/` = feature sections (Role, Skills,
  Source, Facet, TrackTree, ActiveFiltersBar) + `index.ts` that **re-exports**
  primitives from data/filters (barrel masks the layering).
- reverse-ats reuses primitives directly.

Problems: (a) primitives live under the name "data" — nobody will look there;
(b) feature sections sit in page-private `_components` even though their contract is already
used by two pages via types; (c) barrel re-export hides where things come from.
This is **one** `vacancy-filters` feature sliced in half.

## 4. use client map (~50 files)

- `ui-kit`: clean — client-only CopyButton, EmailInput. ✅
- `market-snapshot`: **entire** subtree is client (all charts, tabs, toggles, filter sections).
  Partially justified (interaction), but TopSkills/TopRoles/SeniorityBars render static data —
  client boundary needs verification.
- Landing sections: `PipelineCard`, `Visuals` are client (animations?) — check whether
  server + client leaf is feasible.
- `components/data/filters/Section` — client for mobile accordion; ok, but another argument
  that this is not "data".

Separate investigation item before migration: measure the client bundle of the main page.

## 5. components/shared — fake tier-2

Header, Footer, AppToaster — consumed only by layouts (root + feed pages).
This is app-level chrome, not a shared layer. → `app/_components/` or `features/` by content.

## 6. Name collisions and minor issues

- Two `Section.tsx`: `ui-kit/layout/Section` and `data/filters/Section` (collapsible).
- `tsconfig.tsbuildinfo` sits in the root of apps/web (check .gitignore).
- `design/landing.pen` — one file, ok.

## What we are NOT touching (healthy)

- `lib/api/` — 13 typed fetchers through a shared client.ts, single boundary with backend. ✅
- `ui-kit` structure (badges/buttons/cards/inputs/layout/typography). ✅
- Per-route `_components` collocation in investigation. ✅
- Taxonomy `_hooks` pattern. ✅
