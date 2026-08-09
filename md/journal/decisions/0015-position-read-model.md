# ADR-0015 — Position is the default read entity; three curated views draw the boundary

**Status:** accepted · 2026-08-09 · MET-137 / MET-138
**Branch:** `feat/positions`

## Context

ADR-0012 made Position the public grain and gave every posting a mandatory group.
It did not give consumers an *object* to read. So each one re-derived the grain in
its own SQL: the feed collapsed groups with a window function over `vacancies`,
company facets used `count(DISTINCT coalesce(...))`, the market aggregate counted
postings outright, and `node_skill_cooc` (MET-131) joined
`unique_vacancies → canonical_vacancy_id → vacancy_nodes` by hand. Five
implementations of one definition, each free to drift, and every new source or ATS
would have to learn the same join.

Measured on the 2026-08-07 restore: 15,101 postings against 12,773 positions. Any
consumer that forgets to collapse overstates the market by ~18%.

## Options

### A — A shared TypeScript constant / query helper

- ✅ No migration, no new database objects.
- ❌ Invisible to `psql`, the Lab pipeline, and any future ATS adapter — the three
  places that most need the definition.
- ❌ Keeps the canonical-posting join in application code, so "what is a Position"
  stays a Nest implementation detail.

### B — Materialize a `positions` table refreshed post-ingest

- ✅ Fast reads by construction; a natural home for future rollups.
- ❌ Buys a refresh step and a staleness window before anything measured demanded
  one. At ~13k rows the joins are trivial.
- ❌ Two truths during the refresh gap, which is exactly the drift we are closing.

### C — Three curated regular views: `postings`, `positions`, `position_nodes`

- ✅ One semantic contract, expanded into the consumer's query by the planner — no
  refresh, no staleness, nothing to schedule.
- ✅ `psql`, the Lab, and any future adapter inherit the definition for free.
- ✅ Additive and reversible: the views hold no copied data, so a rollback is a
  forward view fix, never a restore.
- ❌ A view can hide a bad plan behind a tidy name; needs `EXPLAIN` when a
  consumer gets slow rather than a reflexive matview.

## Decision

**Option C.** The defect was the missing object, not the call sites, so the fix is
an object rather than a fifth careful re-derivation.

The layering is deliberate and the lower levels stay:

```text
source record → Posting (vacancies) → dedup group → Position (unique_vacancies)
```

`postings` is a curated facade over `vacancies` — explicit columns, never
`SELECT *`, no embeddings or dedup internals — with the identity renamed
`posting_id` and `position_id` kept visible. `positions` is one row per
`unique_vacancies.id` carrying the **canonical** posting's facts plus
`representative_posting_id` as a display pointer. `position_nodes` reprojects the
canonical posting's `vacancy_nodes` onto `position_id`, preserving required *and*
optional links.

Two rules make the split safe. **Canonical supplies facts; representative supplies
the current link.** Filters, counts, taxonomy, and analytics read canonical fields,
so a repost arriving from a second board cannot change what a Position *is* — only
which card is freshest. And **the views contain all rows**: eligibility,
VERIFIED-node gates, and time windows stay explicit consumer rules, because
different products deliberately use different eligibility layers.
`ELIGIBLE_POSITION` sits beside the old `ELIGIBLE_VACANCY` for the migration.

Regular views over a matview is a measured choice, not thrift: at ~13k positions
the join is small, and the expensive aggregates that *do* need materializing
(`node_stats`, `node_skill_cooc`) already are — they now read *through* the views
instead of re-deriving the join.

**Calibration-sensitive scoring is explicitly out of scope here.** IDF,
recommendation cohorts, role suggestions, and match telemetry keep their posting
grain until MET-139 measures the before/after and retunes the thresholds. Changing
the grain and the calibration in one step would leave no way to attribute a
regression. Every such read now carries a `POSTING-GRAIN-EXEMPT` comment, and a
guard test fails any *new* raw aggregate that lacks one.

## Consequences

- One definition of Position, visible in the schema, inherited by ad-hoc SQL and
  the Lab pipeline for free.
- `coalesce(unique_vacancy_id, id)` and the feed's collapse window function are
  gone; feed total, market total, facet counts, and track counts agree by
  construction rather than by parallel care. Verified equal at 12,456 eligible
  positions on the restore.
- `node_skill_cooc` was rewired through the views with **byte-identical output** —
  4,143 pairs, zero diff across all 11 columns — so the rewrite is provably a
  refactor and not a metric change.
- Price: one deliberate behaviour change. `?sourceId=` now means "this Position has
  a posting on that source" and still shows the Position's real representative,
  instead of re-picking a filter-scoped member. Counts stay correct; a filtered
  card can now show a link from a sibling source. The old fallback made display
  depend on the filter, which no aggregate could reconcile with.
- Price: `hydrateByIds` stays posting-grain on purpose. The matcher picks a
  specific member (e.g. an on-stack duplicate over a better-scoring off-stack one)
  and needs that exact id echoed back; routing it through the representative would
  silently overturn the pick.
- Snapshots (MET-140) get a clean source: an append-only copy of `positions` +
  `position_nodes` at an as-of time, which is what makes a Lab result reproducible.
- Physical tables were not renamed and no raw data was deleted, so reprocessing,
  source diagnostics, and taxonomy replay all still work off preserved postings.
