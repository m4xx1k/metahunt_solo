# Prompt: code review PR #208 (Phase D1 — CONCEPT chips in the filter rail)

Paste into a fresh chat/agent to review before merge. Not yet merged —
this review is what decides whether it ships as-is.

---

```
Working in metahunt_solo. Read /CLAUDE.md first.

TASK: Code-review GitHub PR #208 (branch feat/taxonomy-kind-rail) —
"feat(taxonomy): color CONCEPT chips in the filter rail (Phase D1)".
Use `gh pr diff 208` or `gh pr view 208` to pull it, or check out the
branch. Don't merge — report findings, let the owner decide.

CONTEXT: `nodes.kind` (TECH/CONCEPT/SOFT) already shipped and is live on
prod. This PR is a pure style pass: skill filter chips render blue
(accent-secondary) when the underlying node's kind is CONCEPT (a
practice/architectural style like "CI/CD", "RAG", "Microservices") instead
of looking identical to a TECH chip (a library/tool). Sort order is
untouched — stays purely by `df`; kind was deliberately never made a sort
key, so a rare TECH chip can't outrank a common CONCEPT one. Background:
md/journal/migrations/taxonomy-implication-graph.md, "Phase D1" (rail
composition decision) and section 2.1 ("kind ≠ visibility" — a CONCEPT is
VERIFIED, scored, matched; only kept off nothing here, it's IN the rail
same as TECH, just colored).

FILES CHANGED (9):
- apps/etl/src/03-discovery/feed/facets.service.ts — getSkillFacets() now
  selects+returns n.kind alongside id/name/count
- apps/etl/src/03-discovery/feed/feed.contract.ts — NodeFacet.kind? added
- apps/web/lib/api/facets.ts — hand-mirrored NodeFacet.kind? (per ADR-0005,
  web doesn't import etl's contract types directly — check this mirror
  actually matches)
- apps/web/ui/inputs/types.ts — SelectOption.kind?
- apps/web/ui/inputs/pill.ts — chipClass(active, kind?) — CONCEPT branch
  added, default branch unchanged
- apps/web/ui/inputs/MultiSelect.tsx — passes o.kind to chipClass for both
  selected and unselected chips
- apps/web/features/vacancy-filters/types.ts — OptionRow.kind?
- apps/web/app/(feed)/_components/market/FeedFilters.tsx — skillOptions
  adapter now includes kind; skillCatalog prop type widened to
  (TrackAxis & { kind?... })[]
- apps/web/features/tracks/TrackAxisSection.tsx — a SEPARATE chip-rendering
  component (used on /track/<slug> pages) that the first pass of this work
  missed entirely — added a kindOf(id) resolver (falls back through
  presets → catalog → suggestions, since only `catalog`, i.e.
  facetsApi.skills(), actually carries kind — presets/suggestions come from
  different track-specific endpoints that don't)

REVIEW FOCUS — things worth scrutinizing hardest:
1. The kindOf() fallback chain in TrackAxisSection.tsx: a preset or
   suggested skill only gets colored if it's ALSO found by id in `catalog`.
   Is there a realistic path where a track's preset/contextual skill is
   NOT in the full VERIFIED skill catalog (facetsApi.skills(), which
   INNER JOINs position_nodes)? If so, that skill silently renders
   uncolored — acceptable degradation or a real gap worth fixing at the
   backend (adding kind directly to getTrackPreset/getContextualSkills)?
2. Is coloring by kind at all the right default, or should it be
   opt-outable / configurable? (Product call already made upstream — flag
   only if the implementation forces something that wasn't actually
   decided.)
3. Any other skill-chip rendering path in the app that got missed the same
   way TrackAxisSection did the first time — grep for other consumers of
   chipClass / SelectOption / OptionRow / NodeFacet that render skills and
   check each one actually has a route to `kind`.
4. Type duplication: kind is now hand-typed as the literal union
   "TECH" | "CONCEPT" | "SOFT" | null in 5+ places instead of importing
   NodeKindValue from taxonomy.contract.ts once. Deliberate (feed.contract.ts
   documents itself as "kept free of NestJS/Drizzle/runtime imports" and
   apps/web hand-mirrors everything per ADR-0005) — confirm that's still
   the right call here, or if a shared constant is cheap enough now.
5. Standard passes: correctness, reuse, efficiency, simplification per
   whatever your review tooling's usual bar is.

VERIFY:
- `pnpm lint`, `pnpm test:web`, `pnpm test:etl` all green (they were at
  commit time — confirm still true)
- `pnpm --filter @metahunt/web exec tsc --noEmit`,
  `pnpm --filter @metahunt/etl exec tsc --noEmit`

Report findings only — no fixes, no merge. The owner decides what to act on.
```
