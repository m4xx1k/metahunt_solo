# front-refactor — restructuring apps/web

Status: **done — 5 commits on branch `refactor/front-structure`, not merged**.
Session: `front-refactor`. Started: 2026-06-10.

## Outcome (deviations from plan)

- tsconfig paths required no changes — `@/*` already covers `entities/`, `features/`.
- `topSlot`/`aside` slots in VacancyCard **deferred** (YAGNI): the only consumer variant
  (MatchCard) composes externally; add slots when someone needs to inject inside the card.
- Commit 5 became dead-code removal instead of use-client trimming: TopSkills, TopRoles,
  SeniorityBars, FormatDonut, SourceTabs had no importers. All live `use client` directives
  are justified (framer-motion or state) — bundle unchanged, nothing to remove.
- Intentionally untouched (investigation, lower priority):
  `RssRecordCard.SkillsRow` still renders chips locally (skills there are `string[]`, not
  `NodeRef[]`); the third `formatLocations` in `lib/extracted-vacancy` is NOT a duplicate
  (input type is `ExtractedLocation[]`).
- Normative rules from rules.md moved to `apps/web/CLAUDE.md` (commit 4).

## Second wave (same day, after Max's review)

- Naming audit → [naming.md](naming.md); top-3 renames applied:
  `TrackAxisSection`, `FeedHero` + `market/` folder, `FeedFilters`.
- `welcome` moved from `(feed)` to `app/welcome/` along with 9 sections — two pages
  no longer share a single `_components` (that was the main smell).
- `components/ui-kit` → top-level `ui/` — the `components/` level with a single child
  removed; now each top folder is a layer: `app / entities / features / ui / lib`.
- `features/` with a single slice is intentional: layers fill via the promotion rule,
  not for symmetry (documented in CLAUDE.md as "Sparse layers are fine").

## Goal

Remove "dumping ground" folders (`components/data`, `components/shared`), features spread
across three locations, and duplicated vacancy cards. Introduce light-FSD rules tailored
to this domain so frontend changes become easy.

## Files

| File | Contents |
|---|---|
| [rules.md](rules.md) | Light-FSD rules for apps/web (layers, imports, slots, DI) |
| [audit.md](audit.md) | Audit findings: duplication, wrong homes, use-client map |
| [target.md](target.md) | Target structure + step-by-step migration plan |
| [naming.md](naming.md) | Frontend vocabulary + naming audit (renames not yet applied) |

## TL;DR findings

1. Two independent vacancy card implementations (`PublicVacancyCard` 326 lines vs
   investigation `VacancyCard` 269) with duplicated skill chips, meta rows, and
   **two different** `formatLocations`.
2. `components/data/` — not a layer, a dumping ground: charts + domain badges + Pagination +
   filters mixed together; half have a single consumer (violates the promotion rule).
3. Filters have the right layering idea (primitives + adapter types vs feature sections),
   but live under wrong names in two non-obvious locations.
4. `components/shared/` — 3 files, consumed only by layout. Fake tier-2.
5. Positive: `ui-kit` is clean, `lib/api` has a clear boundary, adapter pattern in
   `filters/types.ts` is already FSD-ish, `MatchCard` is correct compositor-decorator.
