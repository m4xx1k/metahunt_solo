# filters-components — one filter store + shared filter DTO

**Branch:** `refactor/filters-components`
**Status:** done
**Started:** 2026-07-01 · **Closed:** 2026-07-01

## Outcome

One URL-backed filter store now serves both the feed and reverse-ATS. Backend: a
class-validator `FilterParamsDto` (+ `FeedQueryDto`/`MatchDto`) validates `GET /feed`
and `POST /ranking/match`; the feed gained multi seniority/format + english/employment/
`postedWithinDays`. Frontend: one superset `FilterState`/`FiltersApi` (`useUrlFilters`,
swappable to a state backend); reverse-ATS moved off local `useState` (filters now
shareable), `filter-model.ts` deleted; a shared `<FilterRail lens>` drives both pages.
5 commits (`005d5a5`, `acf92b0`, `aee5259`, `c193c13`, + docs). Verified: 263 etl tests,
web prod build, feed+ranking APIs 200/400 with the new filters live. Deferred: the merged
single page (lens tabs / warm CV widgets / saved-CV switcher) stays `feat/feed-reverse-ats-merge`.

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

## Subtasks

- [x] **T0 — backend class-validator DTOs (feed + ranking) + feed gains cold filters** — done `005d5a5` (263 etl tests green, tsc clean). *done when:* `class-validator`/`class-transformer` added; `FilterParamsDto` + `FeedQueryDto`/`MatchDto` in `platform/shared/`; both controllers bind the DTO under a scoped `ValidationPipe` (feed drops its 18 positional args, ranking drops `MatchBody`); `FeedSearchParams`+`buildWhere` take `seniorities[]`/`workFormats[]` (inArray) + `englishLevels[]`/`employmentTypes[]`/`postedWithinDays`; `feed.controller`, `subscription-matcher`, ranking jest green.
- [x] **T2 — frontend superset `FilterState` + `FiltersApi` (feed visually unchanged)** — done `acf92b0` (web tsc + lint clean). *done when:* `types.ts` unifies to arrays + adds english/employment/fresh/includeNice/minFitTier; `use-url-filters.ts` toggles/setters + plural URL keys; `lib/api/*` maps to DTO param names; `FeedFilters` EnumSections go multi; web tsc + lint green; feed behaves the same (now multi seniority/format).
- [x] **T3 — reverse-ATS onto the shared store** — done `aee5259` (web tsc + lint clean; runtime verify pending). *done when:* `filter-model.ts` deleted (option catalogs moved into the feature); `ReverseAtsClient` uses `useUrlFilters()` with a `useEffect(filters)→run()` re-rank; `MatchFilters` consumes `FiltersApi` (no `toggleIn`/patch); reverse-ATS filters are URL-backed + shareable; tsc + lint green; manual re-rank verified.
- [x] **T4 — shared `FilterRail` widget + cleanup + docs** — done `c193c13` + docs. *done when:* one `FilterRail` (`lens` prop) consumed by both feed + reverse-ATS, divergent sidebars deleted; `md/architecture/overview.md` updated if shape changed; `releases.md` entry; reviewer/verifier pass + comment-cleanup pass; tracker Outcome written.

## Links

- Epic docs: `.scratch/feed-merge-v2/{state-model,filters-and-multiselect,shared-filters-and-slugs-plan}.md`
- Next epic (separate branch): `feat/feed-reverse-ats-merge` (merged single page)
- ADRs: —
- Releases: —
- PR: —
