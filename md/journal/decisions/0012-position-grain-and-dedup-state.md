# ADR-0012 — Position is the public grain; pipeline state leaves the FK

**Status:** proposed
**Date:** 2026-08-07
**Context (in time):** before the data-lab work; market/facet numbers are being corrected
**Branch:** `feat/canonical-vacancy-grain`

## Context

Two entities describe the same thing at different grains. A `vacancies` row is **one posting on one
source** (`unique(source_id, external_id)`). A `unique_vacancies` row is **one real position** after
semantic dedup. Everything the product asserts about the market is a claim at the position grain.

`vacancies.unique_vacancy_id` is nullable, and the null carries two unrelated facts at once: *which
group this posting belongs to* (a fact about the world) and *whether the dedup sweep has processed it*
(pipeline state). The loader sets it to `NULL` on any content change to force re-embedding, and
`DedupService` uses `WHERE unique_vacancy_id IS NULL` as its work queue.

That conflation forces every consumer to write `coalesce(v.unique_vacancy_id, v.id)` to mean "position",
and three consumers each reinvented it differently: the feed collapses with a window function, company
facets use `count(DISTINCT coalesce(...))`, and the market aggregate does not collapse at all. Skill,
role and domain facets, `node_stats` (the IDF weights the matcher runs on) and `node_skill_cooc` all
count postings.

Measured on the local snapshot (9 298 postings, 8 876 groups, 365 groups with more than one member):
eligible postings 9 049 vs eligible positions 8 631 — the grain error is **−4.6%**. Small, but it is
the definition that every later number inherits, including the data lab's.

## Options

### A — Keep the nullable FK, fix call sites with a shared `coalesce` constant

- ✅ Smallest diff; no migration; no pipeline change.
- ❌ Keeps the latch in every query forever, and keeps the queue state inside a data column.
- ❌ Invisible outside the Nest app — the data lab and ad-hoc SQL still have to know the trick.

### B — Add a `canonical_vacancies` materialized view over the current model

- ✅ No write-path change; rollups are free to add.
- ❌ Composition on top of the defect: `coalesce` moves into the view instead of disappearing.
- ❌ Buys a refresh step, a staleness window and a second object before anything demanded it.

### C — Split the two facts: `unique_vacancy_id NOT NULL` + an explicit `deduplicated_at`

- ✅ Every posting always belongs to a group; a group of one is a group. `coalesce` disappears.
- ✅ `unique_vacancies` becomes the real table of real positions, countable and indexable directly.
- ✅ Queue state becomes explicit and observable — and a timestamp answers *when*, which a boolean or an
  enum cannot: oldest-pending age, "re-resolve everything processed before X", drift debugging.
- ❌ Touches the loader and the dedup sweep — the riskiest code in the pipeline.
- ❌ Needs a rollup of representative and freshness onto `unique_vacancies` to be useful for counting.

## Decision

**Option C.** The nullable FK is the defect, not the call sites, and the call sites are where the
symptom keeps reappearing. Every posting gets a group at load time; dedup **merges** groups rather than
assigning them; `vacancies.deduplicated_at timestamptz NULL` carries what the null used to carry —
`NULL` means "not resolved yet", a timestamp means "resolved, and here is when".

A nullable timestamp rather than a status enum, deliberately: it is strictly more informative at the
same cost, it needs no type and no migration to gain a value, and it cannot accumulate dead states that
nothing writes. The same shape extends when needed — operator unlinking becomes `detached_at`, not a new
enum member. Facts with times, not statuses.

The rollups the counting path needs mostly **already exist** and are broken, so this change repairs them
rather than adding parallel columns. `unique_vacancies.first_seen_at` / `last_seen_at` are written by two
different code paths with two different definitions: `DedupService` sets only `last_seen_at`, as
`MAX(published_at)` over members with a non-null embedding; `VacancyRepository.repairCluster` sets both,
as `COALESCE(MIN/MAX(published_at), MIN/MAX(loaded_at))` over all members. Two writers, two meanings, one
column — they drift by construction. Both are replaced by one shared statement.

The names also mislead: `*_seen_at` is computed from `published_at`, which is the source's claim, not
when metahunt saw anything. Measured: 12.8% of postings (1 187) have `published_at` later than
`loaded_at` — median +24d on djinni, +59d on dou — because sources bump the publication date when a
listing is refreshed. So `published_at` is a *bump* timestamp: a good liveness signal, and a bad basis
for "when did this position first appear". Columns are renamed to say what they hold, and
`first_loaded_at` (`MIN(loaded_at)`) is added as the one trustworthy first-appearance fact — the
timestamp any cohort or trend must be built on.

Merged skills and the salary range across members are **not** in scope here — they only matter once Fit
is scored per position, which is a separate decision.

We are explicitly rejecting a materialized view for now. It stays available for the heavy rollups that
should not ride the write path, and the case for it should be made against a measured cost, not
anticipated.

Ordering matters and is part of the decision: the constraint change ships **before** any change to
`node_stats`. Recomputing IDF over positions changes matcher output and needs its own before/after
evidence — see ADR-0014 when it is written.

## Consequences

- One definition of "position", visible in the schema rather than in TypeScript, so the data lab and
  any ad-hoc SQL inherit it for free.
- `coalesce(unique_vacancy_id, id)` is deleted from the feed, ranking, facets and future analytics; the
  feed's collapse and the market's count finally agree.
- Digest de-duplication can move from `vacancies.id` to the group, which closes the "same position
  re-sent from another source" gap without new machinery.
- Price: the loader's "invalidate derived fields" path and the dedup sweep both change; both are
  covered by existing integration tests that must be extended before the change, not after.
- A live drift bug is closed: one shared rollup statement replaces two divergent ones, and a
  reconciliation query makes any future drift visible instead of silent.
- Trend work gets an uncontaminated time axis (`first_loaded_at`) instead of a bump-inflated one.
- Operator unlinking is explicitly **not** modelled yet. When an admin surface exists it arrives as
  `detached_at`, additively, with no change to anything decided here.
- The IDF weights stay on the posting grain for now; that debt is recorded and deliberately not paid in
  this change.
