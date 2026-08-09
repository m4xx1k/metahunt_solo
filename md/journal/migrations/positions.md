# positions — Position read model

**Branch:** `feat/positions`
**Status:** in-progress
**Started:** 2026-08-09 · **Closed:** —

## Outcome

PR 1 (MET-138) ships the read boundary: three curated views (`postings`,
`positions`, `position_nodes`), a shared `ELIGIBLE_POSITION` predicate, and every
non-calibration public read moved to Position grain. `node_skill_cooc` was rewired
through the views with byte-identical output. Calibration-sensitive scoring stays
posting-grain behind explicit exemptions until MET-139.

## Subtasks

- [x] T0 — Restore prod dump into an isolated `metahunt_met137` — *done when:* integrity counts are 0 orphans / 0 broken canonical. **✅ 15,101 postings · 12,773 positions · 0 / 0**
- [x] T1 — Add the three views + `ELIGIBLE_POSITION`, migration `0044` — *done when:* one row per UV, unique ids, canonical-node parity both directions. **✅ 12,773 = 12,773, EXCEPT both ways = 0**
- [x] T2 — Integration fixture for the contract — *done when:* a repost proves one Position and canonical facts survive a representative change. **✅ `positions.int.spec.ts`, 4 cases**
- [x] T3 — Rewire `node_skill_cooc` through the views, migration `0045` — *done when:* output is unchanged row-for-row. **✅ 4,143 pairs, zero diff on all 11 columns**
- [x] T4 — Move feed / market / facets to Position grain — *done when:* totals agree under identical filters + unit/asOf/window metadata present. **✅ market total = role-facet sum = 12,456**
- [x] T5 — Move tracks (`track_counts` migration `0046`, preset, contextual skills) — *done when:* a track's number equals what clicking it returns. **✅ 55 track rows, int suite green**
- [x] T6 — Move the Lab population to the views — *done when:* `lab:data` rebuilds and `lab:check` passes. **✅ 417 nodes · 4,143 edges · 11 roles; skill-link parity 78,500 = 78,500**
- [x] T7 — Architecture guard — *done when:* a new raw `vacancies` aggregate under `03-discovery` fails without an exemption. **✅ verified by planting a violation**
- [x] T8 — Full verification suite + fresh-restore migration replay — *done when:* db:check, builds, lint, unit, int, lab all green on a DB rebuilt from the dump. **✅ replayed all 47 migrations onto a virgin restore (`metahunt_met137_replay`): invariants 12,773 = 12,773, node parity 0/0 both ways, matview indexes recreated, cooc byte-identical to the `0043` definition. db:check · database build · etl lint · 523 unit · 111 int · lab:check · lab:build · `git diff --check` all green**
- [x] T9 — Open PR 1, sync Linear MET-138 / MET-137. **✅ [PR #175](https://github.com/m4xx1k/metahunt_solo/pull/175), commit `0b6179d`, all 7 CI checks green; MET-138 → In Review, MET-137 → In Progress**
- [ ] T10 — Production rollout observation (post-merge) — *done when:* Railway deployed the exact merge commit, pre-deploy migration succeeded, `/healthz` all `ok: true`, prod invariants + feed/market/facet/track totals verified, and one scheduled ingest/refresh observed.

## Decisions

- **Regular views, not matviews.** ~13k positions; the join is small and a refresh
  step would buy a staleness window for nothing. The expensive aggregates that
  already are materialized (`node_stats`, `node_skill_cooc`) now read *through* the
  views. Full reasoning in ADR-0015.
- **`?sourceId=` changed meaning, deliberately.** It now asks "does this Position
  have a posting on that source" and still displays the Position's real
  representative, instead of re-picking a filter-scoped member. The old fallback
  made *display* depend on the filter, which no aggregate could reconcile. One
  int-test expectation was updated to encode the new contract.
- **`hydrateByIds` stays posting-grain.** The matcher picks a specific member (an
  on-stack duplicate over a better-scoring off-stack one) and relies on that exact
  id coming back; the representative would overturn the pick. Cutover is MET-139.
- **Drizzle drops matview indexes on regenerate.** `0045` re-creates
  `node_skill_cooc_pair_key` / `_a` / `_b` by hand — the indexes were added
  manually in `0043` and drizzle-kit does not track them, so a bare
  `DROP MATERIALIZED VIEW` would have silently lost all three.
- **Raw `db.execute` returns timestamp strings, not `Date`.** Unlike the typed
  `.select()` builder it does no schema-aware parsing, so Position rows wrap
  `loaded_at` / `updated_at` / `published_at` in `new Date(...)` explicitly.

## Links

- ADRs: [0015](../decisions/0015-position-read-model.md) (this initiative), [0012](../decisions/0012-position-grain-and-dedup-state.md) (grain + dedup state), [0014](../decisions/0014-skill-graph-and-the-lab.md) (Lab)
- Linear: MET-137 (parent) · MET-138 (PR 1) · MET-139 (scoring cutover) · MET-140 (snapshots)
- Migrations: `0044_positions_read_model`, `0045_node_skill_cooc_via_position_views`, `0046_track_counts_position_grain`
- Releases: [2026-08-09](../releases.md)
- PR: [#175](https://github.com/m4xx1k/metahunt_solo/pull/175)
