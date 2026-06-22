# Target structure + migration plan

Principle: minimum moves, maximum clarity. `lib/` and `ui-kit` stay untouched —
add `entities/` and `features/`, dissolve `components/data` and `components/shared`.

## Target tree

```
apps/web/
├── app/                            # routes = composition roots (essentially unchanged)
│   ├── _components/                # app-chrome: Header, Footer, AppToaster (from components/shared)
│   ├── (feed)/
│   │   ├── [[...slug]]/page.tsx    # fetches lib/api → injects into features
│   │   └── _components/            # ONLY static landing content: hero, how,
│   │                               #   pipeline, problem, roadmap, cta, about, ai, result
│   ├── (investigation)/            # unchanged (collocation works)
│   └── reverse-ats/_components/    # stays page-private: ReverseAtsClient, MatchCard,
│                                   #   CandidateProfile (1 page); filters → features
├── entities/
│   ├── vacancy/                    # VacancyCard (single, with topSlot/aside slots),
│   │   │                           #   SeniorityBadge, DuplicatesBadge,
│   │   │                           #   format-locations.ts (one implementation),
│   │   │                           #   labels.ts (from lib/extracted-vacancy)
│   └── skill/                      # SkillChip (required|optional|diff tones)
├── features/
│   ├── vacancy-filters/            # merge of components/data/filters +
│   │   │                           #   market-snapshot/filters: adapter types,
│   │   │                           #   sections, pill/chip classes, use-url-filters
│   ├── market-snapshot/            # market charts/tabs/toggles (from (feed)/_components)
│   └── subscribe/                  # SubscribeButton, waitlist forms (if 2+ locations)
├── components/ui-kit/              # unchanged + ADD: Pagination,
│   └── charts/                     #   Donut, Sparkline, StackedBar (domain-agnostic)
└── lib/                            # unchanged: api/, hooks/, format, utils
```

`components/data/` and `components/shared/` — deleted entirely.

## Key decisions to align with Max

Each commit below has a default selected (marked «◄ decision #N») —
if you disagree, say so before that commit starts.

1. **One VacancyCard with slots or two stylistically distinct ones?** Feed card and
   investigation card have different styles (shadows, CTA sidebar, copy identifiers).
   Proposal: one `entities/vacancy/VacancyCard` with `topSlot`/`aside`/`footer` slots
   + shared building blocks (SkillChips, MetaRow, FactList, formatLocations);
   investigation card assembles from the same blocks but MAY stay a separate component
   if merging requires >3 style-switch props. Blocks shared — wrapper optional.
2. **Where does the ranked/match overlay go?** MatchCard currently wraps PublicVacancyCard — correct pattern;
   keep in reverse-ats/_components (1 consumer), build skill-diff line from entities/skill/SkillChip.
3. **market-snapshot: feature or landing content?** It is live (API-driven) → feature.
   But if only one page uses it — keep collocated and promote later. Leaning toward features/
   immediately because filters are already shared with reverse-ats.
4. **Aliases:** add `@/entities/*`, `@/features/*` to tsconfig paths.

## Migration plan — one branch, 5 commits

Branch: `refactor/front-structure`. Each commit is self-contained and green
(`pnpm lint:web && pnpm build:web` before each); if something breaks — revert the commit,
not the branch. No behavioral changes except the agreed `formatLocations` unification in
commit 1 (record the choice in the commit message).

### Commit 1 — `refactor(web): extract vacancy/skill building blocks into entities`

Extract shared code only; no moves or renames.

- `tsconfig.json`: add paths `@/entities/*`, `@/features/*`.
- Create `entities/skill/SkillChip.tsx` — single chip with tones
  `required | optional | success | danger | muted` (covers feed/investigation chips
  and SkillLine tones in reverse-ats).
- Create `entities/vacancy/`:
  - `format-locations.ts` — single implementation; take the fuller one from PublicVacancyCard
    (shared country appended at end, `+N` overflow) — investigation card gets the same behavior. ◄ decision #2.
  - `Fact.tsx` — moved from `app/(investigation)/_components/Fact.tsx`
    (already shared in substance); `SidebarFact` in PublicVacancyCard replaced by it.
  - `FlagPills.tsx` — moved from `app/(investigation)/_components/FlagPills.tsx`;
    private `FlagPill` in PublicVacancyCard deleted, replaced by shared one.
- Switch to blocks: `PublicVacancyCard`, investigation `VacancyCard`
  (its `SkillsRow`/`formatLocations` — deleted), `MatchCard.SkillLine`.

### Commit 2 — `refactor(web): move vacancy cards to entities/vacancy with slots`

- `components/data/PublicVacancyCard.tsx` → `entities/vacancy/VacancyCard.tsx`;
  add slots `topSlot` / `aside` (rendered only when passed —
  current feed appearance unchanged). ◄ decision #1.
- Investigation `VacancyCard` stays page-private but renamed to
  `VacancyInspectCard.tsx` (resolves name collision per rules.md).
- `components/data/SeniorityBadge.tsx`, `components/data/DuplicatesBadge.tsx`
  → `entities/vacancy/`.
- Update imports: VacancyList (feed), MatchCard (reverse-ats), investigation
  vacancies/records pages.

### Commit 3 — `refactor(web): unify filter layers into features/vacancy-filters`

- `components/data/filters/*` (types, Section, EnumSection, PerksFilter, pill) +
  `app/(feed)/_components/market-snapshot/filters/*` (RoleSection, SkillsSection,
  SourceSection, FacetSection, TrackTree, ActiveFiltersBar, SelectRow)
  → `features/vacancy-filters/` as a flat list.
- `use-url-filters.ts` from market-snapshot → same place (it is filter state, not snapshot state).
- `Section.tsx` → `CollapsibleSection.tsx` (second name collision resolved).
- Delete barrel `filters/index.ts` — all imports direct by file.
- Update imports in market-snapshot and reverse-ats.
- market-snapshot as a whole does NOT move (stays collocated until a second consumer). ◄ decision #3.

### Commit 4 — `refactor(web): dissolve components/data and components/shared`

- `Pagination.tsx` → `components/ui-kit/navigation/`.
- `Donut.tsx`, `Sparkline.tsx`, `StackedBar.tsx` → `components/ui-kit/charts/`
  (domain-agnostic; if domain traces are found during move — clean them first).
- `Header.tsx`, `Footer.tsx`, `AppToaster.tsx` → `app/_components/`.
- Delete empty `components/data/` and `components/shared/`.
- `apps/web/CLAUDE.md`: 3-tier table → new layers (normative part of rules.md
  moves there; this file retains a reference).

### Commit 5 — `refactor(web): push 'use client' to leaves in feed sections`

The only commit with a potentially visible effect (smaller client bundle):

- Check TopSkills / TopRoles / SeniorityBars / TotalCounter — if they render
  static props with no interaction, remove `use client` (keep on toggles/tabs:
  DedupeToggle, SkillScopeToggle, SourceTabs).
- PipelineCard / Visuals on landing — if client boundary exists for animation,
  extract the animated leaf into a small client component.
- Measure before/after: First Load JS size of main page from `pnpm build:web` output;
  record numbers in the commit message.
- If nothing can be removed, the commit shrinks to recording the measurement and a note
  explaining why (do not force it).

### Closing the branch

- Update status in the tracker `README.md`, move the folder to
  `md/journal/migrations/_done/` after merge.
- Run the doc audit from the root CLAUDE.md (`find md product -name '*.md' …`).

## Definition of done

- Folders `components/data`, `components/shared` do not exist.
- Single implementation of formatLocations, skill chips, fact blocks.
- `apps/web/CLAUDE.md` describes the new layers (rules.md → moves there as normative).
- Layer import rule (down-only) is documented; ideally enforced with an eslint boundary rule.
