# Audit — `nodes.kind` end to end (through Phase D1, branch `feat/taxonomy-kind-rail`)

**Date:** 2026-09-07
**Scope reviewed:** the whole `kind` feature as it stands on `feat/taxonomy-kind-rail`
— the `nodes.kind` column + seed (#207, merged), the curation map's use of it
(#207), and the un-merged Phase D1 rail-color pass (commit `1b85e6d`).
**Verdict:** D1 is safe to ship. The core safety property (kind must not touch
ranking) holds today but is untested. Nothing here blocks the merge; the list
below is "what to tighten and when".

This is an audit, not a change. Decisions are the owner's.

---

## 1. What the feature is, layer by layer

| Layer | Files | What it holds |
|---|---|---|
| DB | `libs/database/src/schema/nodes.ts`, migration `0055` | `nodes.kind` enum `(TECH,CONCEPT,SOFT)`, **nullable**. Seeded from `node_tech_meta.category` → 1224 rows; everything else `NULL`. View `track_node_stats`. |
| ETL curation | `apps/etl/src/admin/taxonomy/taxonomy.contract.ts` (`NodeKindValue`, `NODE_KINDS`, `MapNodeItem.kind`, `SetNodeKindDto`), `taxonomy.service.ts` (`setKind`, auto-verifies HIDDEN), `taxonomy.controller.ts` (`PATCH /admin/taxonomy/nodes/:id/kind`) | source of truth + the map's write path |
| ETL feed | `apps/etl/src/03-discovery/feed/facets.service.ts` (`getSkillFacets` selects `n.kind::text`), `feed.contract.ts` (`NodeFacet.kind?`) | read path to the frontend |
| Web API mirror | `apps/web/lib/api/facets.ts` (`NodeFacet.kind?`, hand-mirrored per ADR-0005), `apps/web/lib/api/taxonomy.ts` (`NodeKind`) | |
| Web feature/ui types | `features/tracks/TrackAxisSection.tsx` (`TrackAxis.kind?`), `features/vacancy-filters/types.ts` (`OptionRow.kind?`), `ui/inputs/types.ts` (`SelectOption.kind?`) | |
| Web render | `ui/inputs/pill.ts` (`chipClass(active, kind?)` → CONCEPT blue), `ui/inputs/MultiSelect.tsx`, `features/tracks/TrackAxisSection.tsx` (`kindOf(id)`), `app/(feed)/_components/market/FeedFilters.tsx` (adapter), `app/dashboard/taxonomy/map/_components/TileGrid.tsx` (`KIND_STYLE`) | |

Data flow for the rail color:
`nodes.kind` → `getSkillFacets()` SQL → `feed.contract.NodeFacet` → HTTP →
`lib/api/facets.NodeFacet` → `getSkillCatalog()` (`unstable_cache`) → feed
`page.tsx` → `FeedShell`/`FeedShellIsland` (`skillCatalog: TrackAxis[]`) →
`FeedFilters` → `skillOptions: OptionRow[]` → `FilterRail` → `MultiSelect` →
`chipClass(active, o.kind)`; and separately `FeedFilters` → `TrackAxisSection`
(`catalog`) → `kindOf(id)` → `chipClass`.

---

## 2. Backend vs frontend split — clean?

**Yes, the split is right.** `kind` is a DB column, so backend owns it and only
exposes it as a read on the one endpoint that needs it (`/feed/skills`). The
*use* — chip color — is pure presentation and lives entirely in the frontend.
Nothing about `kind` leaks into ETL scoring, `node_stats`, or `/match`
(verified: `grep` for `.kind` in `apps/etl/src` outside `taxonomy/` and
`facets.service.ts` finds only unrelated `resolved.kind` / `artifact.kind`).
That isolation is the whole point of the `kind` ≠ visibility design and it
currently holds.

**One seam worth naming:** the *colour mapping* (which kind → which token) now
lives in **two** frontend files that share no code:

- `ui/inputs/pill.ts` `chipClass` — handles only `CONCEPT` (→ `accent-secondary`);
  `TECH` / `SOFT` / `null` all fall through to the default accent branch.
- `app/dashboard/taxonomy/map/_components/TileGrid.tsx` `KIND_STYLE` — full map:
  `TECH`→accent, `CONCEPT`→accent-secondary, `SOFT`→success, `null`→border.

These are genuinely different surfaces (a dense filter chip vs. a curation tile
that must show all four states), so this is **not** "one logic implemented
twice". But `CONCEPT = accent-secondary` is now an unwritten convention repeated
in two places. If a third surface ever needs it, it gets typed a third time.
*Low severity.*

---

## 3. Multiple implementations of one thing

### 3.1 The `"TECH" | "CONCEPT" | "SOFT"` literal union — typed 11 times

Canonical names already exist: `libs/database` `NodeKind`, `apps/etl`
`taxonomy.contract.NodeKindValue` (+ `NODE_KINDS` array), `apps/web`
`lib/api/taxonomy.NodeKind`. **None of the D1 code reuses any of them.** The
string union is re-typed inline in:

`feed.contract.ts:273`, `facets.service.ts:31`, `lib/api/facets.ts:14`,
`ui/inputs/pill.ts:29`, `ui/inputs/types.ts:12`,
`features/vacancy-filters/types.ts:19`, `features/tracks/TrackAxisSection.tsx:35`,
`app/(feed)/_components/market/FeedFilters.tsx:67` (+ the three canonical
definitions).

- The `apps/etl` ↔ `apps/web` boundary duplication is **deliberate** — ADR-0005,
  `feed.contract.ts` is documented as import-free and web hand-mirrors. Leave
  `feed.contract.ts` and `facets.service.ts` as they are.
- **Inside `apps/web` there is no such excuse.** `pill.ts`, `ui/inputs/types.ts`,
  `features/vacancy-filters/types.ts`, `TrackAxisSection.tsx`, `FeedFilters.tsx`
  and `lib/api/facets.ts` can all `import type { NodeKind }` and write
  `NodeKind | null`. ~6 occurrences collapse to one import. This is the single
  biggest "not as simple as it could be" finding.

**Risk if left:** the six copies can drift. `OptionRow` and `SelectOption`
already bridge only by structural typing at the `FilterRail → MultiSelect`
boundary (`FilterRail` passes `OptionRow[]` where `MultiSelect` wants
`SelectOption[]`); if one union is narrowed and the other isn't, TS breaks there
with a message that points at the wrong place.

### 3.2 Redundant intersection in `FeedFilters.tsx:67`

`skillCatalog?: (TrackAxis & { kind?: "TECH" | "CONCEPT" | "SOFT" | null })[]` —
`TrackAxis` (imported from `TrackAxisSection.tsx`) **already has `kind?`** since
D1. The `& { kind?... }` is now a no-op that also happens to be the 4th hand-typed
union. It reads as if there is a real type difference between this prop and the
one in `FeedShell`/`FeedShellIsland` (`skillCatalog?: TrackAxis[]`) — there is
not. *Delete the intersection, use `TrackAxis[]`.* Cheap, removes real confusion.

### 3.3 `kindOf()` mirrors `nameOf()` in `TrackAxisSection.tsx`

Lines 69–73 (`nameOf`) and 79–82 (`kindOf`) are the same 3-source
`.find()?.x ?? .find()?.x ?? .find()?.x` chain over `presets` / `catalog` /
`suggestions`. Could be one `resolve(id)` returning the row, or a generic
`fieldOf(id, key)`. Cosmetic — the explicit form is arguably easier to read.
*Leave unless the file is touched again.*

### 3.4 Two chip systems, now diverging

`chipClass` (filter inputs) and `entities/skill/SkillChip` (`TONES` map — vacancy
card, `/match`) are separate implementations of "a bordered mono skill chip".
The D1 comment in `pill.ts` even says "Matches SkillChip's geometry/tone". They
were never unified; D1 widens the gap by teaching `chipClass` about `kind` while
`SkillChip` stays unaware. Not introduced here, but if CONCEPT colour is ever
wanted on the vacancy card, that's a third mapping. *Larger refactor, out of
scope for D1.*

---

## 4. Where it can break

### 4.1 `kindOf()` colours a chip only if the skill is also in `catalog`

**This is "review focus 1" from the prompt.** `catalog` = `facetsApi.skills()`,
whose SQL `INNER JOIN position_nodes … status='VERIFIED'` over the *eligible*
Position set. A track **preset** (`track_nodes`) or **contextual** skill
(`track_node_stats`) that is VERIFIED but currently has **zero eligible
positions** is absent from `catalog` → `kindOf` returns `undefined` → the chip
renders in the default (TECH-looking) style.

- **Realistic path:** a curator recovers a concept from HIDDEN on the map (one
  click → VERIFIED). It's now in the track preset, but until an *eligible*
  (fresh, non-expired) posting links it, it is not in `/feed/skills`. Its chip on
  `/track/<slug>` shows uncoloured in that window.
- **Impact:** cosmetic only — the chip works, it's just not blue. No data loss,
  no wrong filter.
- **Fix (later, backend):** add `kind` directly to `getTrackPreset` /
  `getContextualSkills` responses so the fallback chain isn't needed. Worth doing
  **when Phase C lands** and concepts actually start flowing; not before.

### 4.2 CONCEPT colour is not a global invariant — only 2 of 5 `chipClass` callers pass `kind`

`grep chipClass` → five call sites:

| Site | Passes `kind`? |
|---|---|
| `ui/inputs/MultiSelect.tsx` (feed skill rail) | yes |
| `features/tracks/TrackAxisSection.tsx` (`/track/<slug>` chips) | yes |
| `app/match/_components/StepExcludes.tsx:94` (own-skills → exclude picker) | **no** — `chipClass(false)` |
| `app/radar/[track]/page.tsx:293` (per-vacancy skill chips in the radar list) | **no** — `chipClass(false)` |

- `StepExcludes` renders `ownSkills` (`SkillPick = {id,name}`, CV-extracted, no
  `kind`). It *does* already fetch `facetsApi.skills()` in the same component
  (`useQuery(["skills-catalog"])`), so it could resolve `kind` with a small
  lookup — it just doesn't.
- `radar/[track]/page.tsx` renders per-vacancy skills; that payload has no `kind`.

**Impact:** a user sees "RAG" blue in the feed filter rail and grey in the
`/match` exclude picker — inconsistent. Not a bug (kind is optional, absent =
default), but the UX story "CONCEPT chips read as practices" is only true on the
main rail.

**Decision needed (owner):** either
(a) accept "blue only in the primary filter rail", note it, and the current state
is correct; or
(b) declare it global → thread `kind` into `StepExcludes` (cheap, catalog is
already there) and ideally into `SkillChip` (not cheap).

### 4.3 No test coverage — and D5 of the plan explicitly asks for it

- There is **no spec for `getSkillFacets()`** anywhere (`grep` confirms).
- `taxonomy-implication-graph.md` Phase D5 asks for CI guards: "the rail query
  filters/sorts on `kind`; `node_stats` does **not** reference `kind`; `/match`
  have/missing does **not** reference `kind`."
- The isolation holds **today** (verified by hand), but nothing stops a future
  change from joining `kind` into scoring and silently making a rare TECH skill
  outrank a common CONCEPT one — the exact failure the design forbids.

**This is the highest-value fast fix:** it's ~30 min, and it locks in the one
property that actually matters for correctness.

### 4.4 The feature is shipped but ~90% inert

The seed only classified the 1224 nodes that had a `node_tech_meta.category`.
Everything else is `kind = NULL` → default rendering. CONCEPT colouring is only
as complete as the Phase B curation-map work (backend / data-ai / devops / qa /
security), which is mostly **not done**. So D1 "works" but most skills won't be
blue until someone classifies their direction on the map. Not a defect — just
set expectations: D1 is the plumbing, not the payoff.

### 4.5 Minor / non-issues checked

- `GROUP BY n.id, n.canonical_name, n.kind` in `getSkillFacets` — `n.kind` is
  functionally dependent on `n.id`; adding it is harmless, no double-counting.
- `n.kind::text AS kind` — cast to plain string so it matches the hand-typed
  union; fine.
- App is single-theme (dark only — `globals.css` has one palette), so
  `accent-secondary` (`#6B9EFA`) needs no light-mode handling.
- `null` handling: `chipClass` checks `kind === "CONCEPT"`, which is null-safe;
  `kind?` optional everywhere downstream. OK.
- `TileGrid` `KIND_CYCLE` (`SOFT→TECH`, `null→TECH`) — click-cycle can't reach
  SOFT and can't set `null`; deliberate (`s` key does SOFT), and it's #207 code
  not D1.

---

## 5. Recommendation — what to do and when

Decisions are the owner's; this is a suggested ordering.

### Fix now (cheap, locks the safety property or removes real confusion)

1. **Add the D5 CI guard tests** — assert `getSkillFacets()` returns `kind`;
   assert no `kind` reference in the ranking / `node_stats` / `/match` query
   paths. Highest value, lowest cost.
2. **Delete the `& { kind?... }` intersection** in `FeedFilters.tsx:67` — use
   `TrackAxis[]`. Removes a misleading 4th union.
3. **One `getSkillFacets()` spec** covering the `kind` column round-trip.

### Fix soon (consistency, low risk)

4. Collapse the ~6 `apps/web` inline unions to
   `import type { NodeKind } from "@/lib/api/taxonomy"` + `NodeKind | null`.
   Leave `feed.contract.ts` / `facets.service.ts` alone (ADR-0005 boundary).
5. Add one comment line to `chipClass`: "only CONCEPT is styled; TECH/SOFT/null
   → default, by design."
6. **Owner decision** on §4.2: is CONCEPT colour global or rail-only? Then either
   thread `kind` into `StepExcludes` or document "rail-only" and stop.

### Leave for later (graceful today, tracked by Phase B/C)

7. `kindOf()` catalog-miss (§4.1) → fix at backend when Phase C lands
   (`getTrackPreset` / `getContextualSkills` carry `kind`).
8. Unify `chipClass` + `SkillChip` into one chip system — separate refactor.
9. `kindOf`/`nameOf` resolver duplication — cosmetic, only if the file is
   reopened.

### Not blocking the D1 merge

Nothing above blocks it. D1 is a correct, isolated style pass. Ship it, then take
items 1–3 as a fast follow.
