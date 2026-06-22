# Frontend vocabulary + naming audit

Status: audit done 2026-06-10, top-3 renames APPLIED same day
(`FacetSection`→`TrackAxisSection` + `Facet`→`TrackAxis`, `Snapshot`→`FeedHero`,
`MarketFilters`→`FeedFilters`, folder `market-snapshot/`→`market/`).
`EnumSection`→`PillsSection` intentionally NOT done (low priority, churn > benefit).

## Domain vocabulary (how we name things)

| Term | Meaning | Lives in |
|---|---|---|
| **vacancy** | Central entity: one vacancy (DTO from backend) | `entities/vacancy`, `lib/api/vacancies` |
| **track** | Taxonomy branch for browsing (discipline → stack/language) | TrackTree, `lib/api/tracks` |
| **axis** (formerly "facet") | One of two axes of the active track: roles or skills | FacetSection |
| **skill required/optional** | must-have / nice-to-have skill on a vacancy | SkillChip tones |
| **skill have/missing/bonus** | candidate skill diff against a vacancy (reverse-ATS) | SkillChip tones |
| **source** | Vacancy source (Djinni, DOU…) | SourceSection, SourceTabs(†) |
| **perks** | "reserve" + "no test" — two quick market filters | PerksFilter |
| **fit tier** | STRONG / GOOD / STRETCH match verdict | MatchCard |
| **aggregates** | Aggregated market stats from `/market/aggregates` | to-filter-aggregates |
| **dedup** | Removed duplicate vacancies across sources | DedupeToggle, DuplicatesBadge |
| **record** | Raw RSS entry before extraction (internal) | RssRecordCard |
| **extracted** | What BAML extracted from a record | lib/extracted-vacancy |

## Verdicts: wrong → rename

| Current | Problem | Proposal |
|---|---|---|
| `FacetSection` | "facet" is search-engine jargon; says nothing about the track | `TrackAxisSection` (+ type `Facet` → `TrackAxis`) |
| `Snapshot` | No longer a stats snapshot — it is the **feed hero** (heading + count + pipeline) | `FeedHero` |
| folder `market-snapshot/` | Legacy name; contains hero + filters + toggles | `market/` |
| `MarketFilters` vs `MatchFilters` | One-letter difference, two different worlds (feed vs reverse-ATS) — the main trap | `MarketFilters` → `FeedFilters` |
| `EnumSection` | Named after the TS input type, not what the user sees | `PillsSection` (optional, low priority) |

## Verdicts: fine, do not touch

- **`TrackTree`, `SelectRow`, `ActiveFiltersBar`, `SkillsSection`, `RoleSection`, `SourceSection`** — describe what they render. RoleSection and TrackTree coexist legitimately: the former is the flat landing mode, the latter is track mode (comment in MarketFilters explains this).
- **`PerksFilter`** — the "-Filter" suffix differs from "-Section" neighbors, but the name is honest; not worth the churn.
- **`to-filter-aggregates`** — exemplary adapter naming (verb-prefix mapper). Name future adapters the same way.
- **`use-url-filters`, `FiltersApi`, `FilterState`, `EMPTY_FILTERS`** — clean.
- **`filter-model.ts`, `samples.ts`** (reverse-ats) — local, comments explain; ok.
- **`ReverseAtsClient`** — "-Client" suffix is the Next.js convention for a client island page; acceptable.
- **`lib/extracted-vacancy`** — name mirrors the BAML type, documented in ADR-0005; ok. (Future: its labels/formatters essentially belong to `entities/vacancy` — separate discussion.)
- **`SkillChip`, `Fact`, `FlagPill(s)`, `CollapsibleSection`, `VacancyInspectCard`** — new from this refactor, self-describing.

## Minor issues (not worth renaming now)

- `ui-kit/typography/Tag` — renders an eyebrow label ("> how this works"); "Tag" slightly conflicts with skill chips mentally, but used everywhere — expensive to touch.
- `pill.ts` (vacancy-filters) — two helper classes `pillClass`/`chipClass`; file could be `pill-styles.ts`.
- `types.ts` (vacancy-filters) — generic name, but that is convention; the contents are actually the feature contract.

## Rename order if applied

One commit `refactor(web): rename legacy market-snapshot vocabulary`:
1. `FacetSection` → `TrackAxisSection`, type `Facet` → `TrackAxis`
2. `Snapshot.tsx` → `FeedHero.tsx`, folder `market-snapshot/` → `market/`
3. `MarketFilters` → `FeedFilters`
All mechanical (grep + sed), ~10 import files, no behavior change.
