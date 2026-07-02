# filters-components — one filter store + shared filter DTO

**Branch:** `refactor/filters-components`
**Status:** in-progress
**Started:** 2026-07-01 · **Closed:** —

## Scope

Everything filter-related lands on this branch (user directive, 2026-07-02): the
filter **store + rail + DTO** (Phase 1, shipped), the **unified data layer**
(SSR-seed → react-query, shared for both pages), and **slugs-in-URL** (Phase 2).
The merged single page (lens tabs / warm CV widgets / saved-CV switcher) remains
the follow-on `feat/feed-reverse-ats-merge` epic.

**Phase 1 — shipped** (`005d5a5`, `acf92b0`, `aee5259`, `c193c13`, docs, + freshness/
domain/labels refinements): one URL-backed superset `FilterState`/`FiltersApi`
(swappable to state) + shared class-validator `FilterParamsDto` + one shared
`<FilterRail lens>`; reverse-ATS off local state (shareable filters); feed multi
seniority/format + english/employment/domain + a freshness window (default month).
Verified: 263 etl tests, web build, feed+ranking APIs live.

## Context

The feed-merge epic needs the two pages to share one filter layer. Today they don't:

- **Feed** — `useUrlFilters()` (URL-backed, implements `FiltersApi`); `seniority`/`workFormat` still **single-select**. Consumed by `FeedFilters.tsx`.
- **Reverse-ATS** — `useState<Filters>(NO_FILTERS)` in `ReverseAtsClient` (local, not URL); different field set; wired via `onChange(patch)` + `toggleIn`, **not** `FiltersApi`. Consumed by `MatchFilters.tsx`.
- **Backend** — no DTO. `GET /feed` = 18 positional `@Query()` args, single seniority/workFormat, no english/employment/fresh. `POST /ranking/match` = `unknown`-typed `MatchBody`, arrays + `minFitTier`. Both hand-parse with `platform/shared/query-parsing.ts` helpers.

Goal: **one store** (the existing `FiltersApi` seam — URL-backed now, swappable to a state backend for free), **one superset `FilterState`**, and **one shared backend filter DTO** the endpoints reuse + validate. This unifies the filter layer across the *two existing pages*; the merged single-page (lens tabs, warm CV widgets, switcher) stays the separate `feat/feed-reverse-ats-merge` epic.

## Decisions

- **One superset `FilterState`, not a generic schema-core.** User: "cold exposes as much as possible; warm adds only `minFitTier`." So every field is shared/cold-available except `minFitTier` (needs a ranked result). Flat superset beats per-page schemas for KISS; the FiltersApi seam already gives the URL↔state swap.
- **DTO = class-validator DTO classes** (user directive, reversing the earlier hand-parse call). Add `class-validator` + `class-transformer` to `@metahunt/etl`; scope a `ValidationPipe({ transform: true, whitelist: true })` to the Feed + Ranking controllers only (minimal blast radius — no global pipe, other endpoints untouched). New `platform/shared/filter-params.dto.ts` = a base `FilterParamsDto` (the shared superset); `FeedQueryDto extends` it with feed-only fields (q, page, pageSize, includeRoleless/includeAllSkills/includeOptionalSkills, hasDuplicates), `MatchDto extends` it with `skills[]` + page/pageSize. GET arrays normalized single→array (and CSV-split) via a `@Transform`; `minFitTier` lives on the base but only ranking reads it.
- **Frontend type stays web-side (not a cross-boundary shared lib).** Web imports no `@metahunt/*` backend package and `types.ts` is decoupled by design; `lib/api/*` is the single mapping layer and mirrors the DTO's param names. A `libs/contracts` shared type is deferred (YAGNI until a 3rd consumer).
- **URL keys go plural + comma-joined** (`?seniorities=A,B`, `?workFormats=`, `?english=`, `?employment=`, `?fresh=`) to match the existing `roles/skills/domains` convention. Breaks old `?seniority=`/`?workFormat=` bookmarks — acceptable pre-launch; noted for the release entry.
- **Freshness is always-on, no "any" window.** Default = last month; options month/2weeks/week. Applies to both lenses (shared store). Default = clean URL (no `?fresh`); `activeCount` counts it only when narrowed.
- **Data layer = SSR-seed + react-query, pull not push.** The server component does the first fetch for the URL filters → seeds the client query (`initialData`) → client `useQuery` keyed on the filter state → filter changes refetch client-side. Producer (filter UI → URL) and consumer (query ← URL) never reference each other — lower coupling than an `onUpdate` callback, and `FiltersApi` stays unchanged. Per-lens behaviour = a per-lens `queryFn`, not a threaded handler. Feed stops being pure-RSC (becomes server-seeded client-driven) to share one path with reverse-ATS and to be the merged page's foundation.
  - **VERIFIED (Next 16.2.3 docs, do not re-research):** `window.history.pushState(null, '', '?…')` updates the URL **and syncs with `useSearchParams`, with no page reload and no RSC re-render** (`node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` §"Shallow routing on the client"). So `use-url-filters.commit()` swaps `router.push` → `pushState`; `useSearchParams` updates → the query key changes → react-query refetches. No double-fetch. Consequence: drop `useTransition`/`isPending` from the hook — loading now comes from the query's `isFetching`.
  - React Query v5 is React-19/App-Router ready (SPA guide §"SPAs with React Query" → TanStack advanced-SSR). Not yet installed.
- **Slugs = LOCKED to (a) backend accepts slugs.** The feed query resolves slug→id via a `nodes.slug` subquery (`roleNodeId IN (SELECT id FROM nodes WHERE type='ROLE' AND slug IN (...))`); the frontend goes uniformly slug-based (facets' option id = slug, URL = slug, `FilterState` = slug, no id maps anywhere). Ranking has no role/skill/domain filter, so slugs don't touch it. `source` unchanged (already a code).

## Subtasks

- [x] **T0 — backend class-validator DTOs (feed + ranking) + feed gains cold filters** — done `005d5a5` (263 etl tests green, tsc clean). *done when:* `class-validator`/`class-transformer` added; `FilterParamsDto` + `FeedQueryDto`/`MatchDto` in `platform/shared/`; both controllers bind the DTO under a scoped `ValidationPipe` (feed drops its 18 positional args, ranking drops `MatchBody`); `FeedSearchParams`+`buildWhere` take `seniorities[]`/`workFormats[]` (inArray) + `englishLevels[]`/`employmentTypes[]`/`postedWithinDays`; `feed.controller`, `subscription-matcher`, ranking jest green.
- [x] **T2 — frontend superset `FilterState` + `FiltersApi` (feed visually unchanged)** — done `acf92b0` (web tsc + lint clean). *done when:* `types.ts` unifies to arrays + adds english/employment/fresh/includeNice/minFitTier; `use-url-filters.ts` toggles/setters + plural URL keys; `lib/api/*` maps to DTO param names; `FeedFilters` EnumSections go multi; web tsc + lint green; feed behaves the same (now multi seniority/format).
- [x] **T3 — reverse-ATS onto the shared store** — done `aee5259` (web tsc + lint clean; runtime verify pending). *done when:* `filter-model.ts` deleted (option catalogs moved into the feature); `ReverseAtsClient` uses `useUrlFilters()` with a `useEffect(filters)→run()` re-rank; `MatchFilters` consumes `FiltersApi` (no `toggleIn`/patch); reverse-ATS filters are URL-backed + shareable; tsc + lint green; manual re-rank verified.
- [x] **T4 — shared `FilterRail` widget + cleanup + docs** — done `c193c13` + docs. *done when:* one `FilterRail` (`lens` prop) consumed by both feed + reverse-ATS, divergent sidebars deleted; `md/architecture/overview.md` updated if shape changed; `releases.md` entry; reviewer/verifier pass + comment-cleanup pass; tracker Outcome written.
- [x] **T5 — freshness window + domain-in-rail + english labels** — done `c3b2285` (web tsc + lint clean). *done when:* `fresh: boolean` → `freshness` window (month default · 2weeks · week), single-select, top of rail, applied both lenses; domain moved into `FilterRail` (cold-only); english labels on both lenses; freshness chip in `ActiveFiltersBar`.
- [ ] **T6 — unified data layer (SSR-seed → react-query)** — *done when:* `@tanstack/react-query` + a root `QueryClientProvider`; one shared `useResults(lens, …)` hook keyed on the filter state, `queryFn` branching by lens (cold→`/feed`, warm→`/ranking` or `/cv/:id/matches`), seeded by the server component's first fetch (`initialData`/hydration), `placeholderData: keepPreviousData`; feed list + reverse-ATS both render from it (drop `ReverseAtsClient`'s `run()`/effect/refs); `use-url-filters` commits **shallowly** (History API) so a filter change refetches via the query WITHOUT an RSC double-fetch — verify the Next 16 mechanism in `node_modules/next/dist/docs/`; loading/error/isFetching come from the query. `FiltersApi` unchanged.
- [ ] **T7 — slugs in the URL (`?roles=backend-engineer`)** — *done when:* `nodes.slug` column (unique per `(type, slug)`, backfilled `slugify(canonical_name)` + collision suffix, mint-once/immutable on rename, maintained on node create/rename); facet endpoints (`/feed/roles|skills|domains`) return `slug`; URL carries slugs; id↔slug resolved at ONE boundary (decision below); `source` unchanged (already a code); prod backfill run + verified.

## Phase 2 — execution plan (start a fresh session here)

Prereq: Phase 1 is merged or on-branch (`c3b2285` is the last commit). Slug decision is (a). Next 16 shallow-routing is verified above — don't re-research.

### T6 — unified data layer (SSR-seed → react-query)

1. **Deps + provider.** `pnpm --filter @metahunt/web add @tanstack/react-query`. New `app/providers.tsx` (`'use client'`) with a `QueryClientProvider` (client via `useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }))` so seeded data isn't instantly refetched); wrap `{children}` in `app/layout.tsx`.
2. **Shared hook.** `features/vacancy-filters/use-results.ts` → `useResults({ lens, filters, track?, source?, page }, initialData)` = `useQuery({ queryKey: ['results', lens, filters, track, source, page], queryFn, initialData, placeholderData: keepPreviousData })`. `queryFn` branches by lens: cold → `vacanciesApi.list(toListQuery(...))`; warm → `source.kind==='sample' ? rankingApi.match(...) : cvApi.matches(...)`. (One hook = the shared logic; the lens branch is the only difference.)
3. **Shallow URL in `use-url-filters`.** Swap `startTransition(router.push(...))` for `window.history.pushState(null, '', qs ? '?'+qs : pathname)`. Remove `useTransition`/`isPending` from `UrlFiltersApi` (loading is now the query's `isFetching`). Page/offset also moves through `pushState`.
4. **Feed page (`(feed)/[[...slug]]/page.tsx`).** Keep server-fetching aggregates/tracks/catalogs (props, unchanged — they don't depend on filters) + the initial list for the URL filters → pass the list as `initialData` into a client results component (VacancyList becomes client-driven, or a thin client wrapper calls `useResults('cold', …)` reading `useSearchParams`). Stays `force-dynamic`.
5. **reverse-ATS (`ReverseAtsClient`).** Delete `run()`, the filters `useEffect`, `sourceRef`, `mounted` ref, and the `data/loading/error` `useState`; replace with `useResults('warm', { source, filters, page }, { initialData: initial })`. `source`/`page` stay local (they're query-key inputs). Recommendations → its own `useQuery(['recs', candidateId])`.
6. **Wire loading.** `FeedFilters`/`MatchFilters` `disabled`/opacity read the query's `isFetching` (passed from the page) instead of `api.isPending`.
7. **Verify.** Filter toggle → URL updates + ONLY an API call fires (no RSC payload in the network tab); hard reload / shared link → SSR renders the filtered list; no double-fetch on mount (initialData matches the first query key); back/forward works; `keepPreviousData` = no flash; tsc + lint + build; both pages runtime-checked.

**Gotcha:** the server's `initialData` must be produced for the SAME filter set the client's first `queryKey` computes, or react-query refetches on mount (lost SSR benefit). Compute both from the same URL params.

### T7 — slugs in the URL (approach a)

1. **Migration** (`libs/database`): add `nodes.slug text` + unique index on `(type, slug)`. Backfill = `slugify(canonical_name)` with `-2/-3…` collision suffix. Mint on node create; **immutable on rename** (mirror tracks); maintain in the taxonomy admin create/rename paths.
2. **Facets** (`FacetsService` `/feed/roles|skills|domains`): return `slug` alongside `{id, name, count}`.
3. **Feed query** (`FeedQueryDto` + `feed.service`): accept slugs for roles/skills/domains; resolve in SQL via `<col> IN (SELECT id FROM nodes WHERE type=… AND slug IN (:slugs))`. Ranking untouched.
4. **Frontend**: facet option `id` = slug; `FilterState.roleIds/skillIds/domainIds` hold slugs; URL carries slugs; `lib/api` sends slugs. No id on the frontend for these. `source` unchanged.
5. **Prod**: run the backfill; verify renames keep slugs stable; `?roles=backend-engineer,go` filters end-to-end.

## Definition of Done (the whole filters epic / this branch)

- [ ] **T0–T7 committed** on `refactor/filters-components`.
- [ ] **One store**: URL-backed `FiltersApi`/`FilterState` superset, both pages consume it, swappable seam intact; one shared `<FilterRail lens>`; one shared class-validator DTO on feed + ranking.
- [ ] **Data layer**: server-seeded react-query on both pages; a filter change updates the URL via `pushState` and refetches client-side with **no RSC double-fetch** (verified in the network tab); loading/error from the query; back/forward + deep-link + shareable all work; no mount refetch.
- [ ] **Slugs**: URLs read `?roles=backend-engineer` (no UUIDs); prod backfilled; renames keep slugs stable; feed filters by slug end-to-end.
- [ ] **Green**: web tsc + lint + prod build; full ETL suite (incl. new slug + backfill tests); feed + ranking APIs 200/400 with slugs + every filter; both pages runtime-checked (toggle refetches, deep link SSRs, no double-fetch).
- [ ] **Docs**: `overview.md` (react-query dep + data-layer note + `nodes.slug`), `releases.md` entry, tracker Outcome; an ADR for "web client data layer = react-query + SSR-seed" (a real architectural choice) and one for slugs-in-URL if it grows past a line.
- [ ] **PR #59** updated + merged via `gh` (deploys to prod — deliberate, given the URL-key + freshness-default + client-data-layer changes).

## Links

- Epic docs: `.scratch/feed-merge-v2/{state-model,filters-and-multiselect,shared-filters-and-slugs-plan}.md`
- Next epic (separate branch): `feat/feed-reverse-ats-merge` (merged single page)
- ADRs: —
- Releases: —
- PR: —
