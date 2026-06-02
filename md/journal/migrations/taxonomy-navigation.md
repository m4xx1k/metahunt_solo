# taxonomy-navigation — single browse tree (`tracks`) over a two-axis feed

**Branch:** feat/taxonomy-navigation
**Status:** backend complete — schema+migrations (0012 tables, 0013 `track_counts`
view), seed run, and all three API endpoints landed & verified vs dev DB; frontend
next; 2026-06-02
**Started:** 2026-05-29

> **TL;DR (whole doc).** Feed navigation becomes ONE nested list the user browses
> (`Backend > Go`, `Frontend > React`, flat `Data Analyst`). It is a separate
> **`tracks`** tree that *references* existing nodes — `nodes` / `vacancies` /
> `vacancy_nodes` are untouched, so there is **no per-vacancy classification and no
> backfill**. The "two axes" (discipline / stack) are not a UI concept — they are
> `node.type` (ROLE → discipline, SKILL → stack); the tree's nesting is the
> pre-curated AND-composition of the two. Counts come from a live `track_counts`
> VIEW (materialize later if slow). Classification quality (the inflated
> `Software Engineer`) is a *separate* problem, deliberately out of scope here.

## Problem

**TL;DR.** Flat single-select role + multi-select skills is uncomfortable and forces
one navigation axis on two kinds of seeker.

Feed filtering today is a flat single-select role (`vacancies.role_node_id`, 84 seed
roles, `RoleSection` shows `TOP_N` + "show all") plus multi-select skills. Too many
flat roles to scan, and two different seekers are forced through the same door:

- **Stack-centric** (Python / Go / TS / PHP dev) — thinks "show me Go jobs".
- **Discipline-centric** (QA, DevOps, Data Analyst, SRE) — not defined by a language.

Earlier sketches (deep `Engineering → Web → Backend` nesting; two separate chip rows
for stack and discipline) all felt like spaghetti or made the user choose which row
to start in.

## Model (settled) — `tracks` + `track_nodes`

**TL;DR.** Two tiny curated tables describe a browse tree; each tree entry points at
existing nodes; the node's *type* decides which axis it filters. ~50 curated rows
total. Vacancy data is never touched.

```
tracks                     -- the single user-facing tree  (~12 disciplines + ~40 stack children)
  id         uuid pk
  slug       text unique          -- 'backend', 'backend-go', 'data-analyst'
  label      text                 -- 'Backend', 'Go', 'Data Analyst'
  parent_id  uuid NULL → tracks(id)  CHECK(parent_id <> id)   -- disciplines = NULL; stack children → their discipline
  sort_order int  default 0
  is_active  boolean default true

track_nodes                -- each track's OWN criteria; the axis = referenced node.type
  track_id   uuid → tracks(id) on delete cascade
  node_id    uuid → nodes(id)  on delete cascade
  PK(track_id, node_id)
```

- **Axis = `node.type`.** A track that references a ROLE node filters
  `vacancies.role_node_id`; one that references a SKILL node filters via
  `vacancy_nodes`. No `axis`/`kind` enum — `node.type` already encodes it. This
  *structurally* enforces the two-axis purity: you physically cannot filter a
  discipline except through a ROLE node, nor a stack except through a SKILL node.
- **`nodes` / `vacancies` / `vacancy_nodes` UNCHANGED.** No new column, no backfill.
  A track's membership is computed from existing `role_node_id` / `vacancy_nodes`
  at query time. We never classify a vacancy — it is already placed by its
  ingest-time node links; the tree only *queries* that placement.
- **`parent_id` lives only on the ~50 curated `tracks` rows**, never on the hot
  `nodes` table. Self-ref on 50 curated rows, depth 2, `CHECK(parent_id <> id)` —
  trivially safe; this is exactly the cycle/recursion worry we wanted to avoid on
  `nodes`, now confined to a tiny hand-maintained table.

## Nesting & criteria inheritance

**TL;DR.** A child stores only its own criterion; clicking it ANDs its criteria with
its parent's (1 hop up). Max depth 2 → no recursive CTE.

- A discipline track (`Backend`) → `track_nodes` to backend ROLE nodes; `parent_id`
  NULL.
- A stack child (`Backend > Go`) → `track_nodes` to the Go SKILL node only;
  `parent_id` = the `Backend` track. It does **not** repeat the role criterion.
- **Click `t` → effective criteria = `t`'s nodes + `parent(t)`'s nodes** (one hop).
  Partition by `node.type`: ROLE ids → `role_node_id IN (...)`; SKILL ids → `EXISTS`
  in `vacancy_nodes`. AND between the two axes.

| Track | Effective filter |
|---|---|
| `Backend` (parent) | `role ∈ backend-roles` |
| `Backend > Go` (child) | `role ∈ backend-roles` **AND** `skill = Go` |
| `Data Analyst` (flat leaf) | `role ∈ data-analyst-roles` |
| `Frontend > React` (child) | `role ∈ frontend-roles` **AND** `skill = React` |

- **Fullstack — no matrix.** `Fullstack` is its own discipline (a ROLE), a top-level
  track like `Data Analyst`. Optionally give it stack children (`Fullstack > TS`)
  like any discipline. The "front×back matrix" fear came from treating fullstack as
  the *intersection of two disciplines* — it isn't; it's its own role.
- **No standalone language** by design (you rejected `Backend` and `Go` as sibling
  top-level chips). A language lives as a child under each discipline it's relevant
  to (`Backend > Go`, `Data > Python`). If demand appears, a top-level `Languages`
  group is one extra parent row — same mechanism.

## How filtering binds to the feed

**TL;DR.** The feed gains one param `trackSlug`; it resolves to existing role/skill
filters and rides the `buildWhere` machinery already in place.

`ListVacanciesParams` gains `trackSlug?: string` (the user browses slugs; node ids
are unstable). `buildWhere` resolves it to effective node ids via the two tables:

```sql
-- ROLE criteria of the track + its parent
vacancies.role_node_id IN (
  SELECT tn.node_id FROM track_nodes tn
  JOIN nodes n ON n.id = tn.node_id AND n.type = 'ROLE'
  WHERE tn.track_id IN (:trackId, :parentTrackId)
)
-- SKILL criteria of the track + its parent (OR within the stack axis)
AND EXISTS (
  SELECT 1 FROM vacancy_nodes vn
  JOIN track_nodes tn ON tn.node_id = vn.node_id
  JOIN nodes n ON n.id = tn.node_id AND n.type = 'SKILL'
  WHERE vn.vacancy_id = vacancies.id
    AND tn.track_id IN (:trackId, :parentTrackId)
)
```

(Each `EXISTS`/`IN` is emitted only if that axis has nodes for the chosen track.)
The raw `roleId` / `skillIds` params stay as a power-user fallback (`skillIds` keeps
its AND semantics); `trackSlug` is the comfortable default door.

## Contextual skill facet (refinement under a selection)

**TL;DR.** After a track pick, show the skills most common *in the matched
vacancies* (frameworks/libs that distinguish the stack). It's the existing
top-skills aggregate, scoped to the current `WHERE`. No new table.

```sql
SELECT n.id, n.canonical_name, COUNT(DISTINCT vn.vacancy_id) AS cnt
FROM vacancy_nodes vn
JOIN nodes n ON n.id = vn.node_id AND n.type='SKILL' AND n.status='VERIFIED'
WHERE vn.vacancy_id IN ( <vacancies matched by the current trackSlug> )
  AND n.id NOT IN ( <nodes already applied by the track, e.g. Go> )
GROUP BY n.id ORDER BY cnt DESC LIMIT ~12
```

Picking one further ANDs into the existing `skillIds` facet. Coarse entry (tree) →
fine refinement (contextual skills), both count-driven and self-ordering.

## Generic skills (git / sql / english / scrum)

**TL;DR.** Curated stack children never contain basics, so they're clean. Basics
only pollute the *contextual* facet; demote them with an intrinsic `is_generic`
flag — but ship without it first (YAGNI).

Curated stack children are hand-picked, so git/sql can't appear *there*. They only
top the **contextual** facet (live, uncurated) with zero signal. Minimal fix:
`is_generic boolean default false` on the SKILL node — a property of the *entity*,
not nav structure, so it may live on `nodes` without violating nodes≠nav. Exclude
flagged skills from the contextual ranking only (still show them on the vacancy
card). **Deferrable:** ship the facet first; add the flag only if it's actually
noisy on real data. "Lift" (skills over-represented vs global baseline) is a smarter
ranking but explicitly out of scope.

## Counts / analytics

**TL;DR.** One `track_counts` VIEW gives prominence ordering, hide-zero, and
dashboard numbers. Start as a plain VIEW; materialize + post-ingest refresh only at
scale.

```sql
CREATE VIEW track_counts AS
-- discipline tracks: count eligible vacancies whose role is in the track
SELECT t.id AS track_id, t.slug, COUNT(DISTINCT v.id) AS vacancy_count
FROM tracks t
JOIN track_nodes tn ON tn.track_id = t.id
JOIN nodes n        ON n.id = tn.node_id AND n.type = 'ROLE'
JOIN vacancies v    ON v.role_node_id = n.id
JOIN nodes rn       ON rn.id = v.role_node_id AND rn.status = 'VERIFIED'
GROUP BY t.id
UNION ALL
-- stack tracks: count eligible vacancies that have the skill
SELECT t.id, t.slug, COUNT(DISTINCT v.id)
FROM tracks t
JOIN track_nodes tn ON tn.track_id = t.id
JOIN nodes n        ON n.id = tn.node_id AND n.type = 'SKILL'
JOIN vacancy_nodes vn ON vn.node_id = n.id
JOIN vacancies v    ON v.id = vn.vacancy_id
JOIN nodes rn       ON rn.id = v.role_node_id AND rn.status = 'VERIFIED'
GROUP BY t.id;
```

The eligibility predicate (`role VERIFIED`) mirrors the feed exactly so a track's
displayed count equals what a click actually returns. **Multi-membership is fine:** a
vacancy matches many tracks, `child ⊆ parent` (nested sets, not a partition). Counts
are **per-track independent** `COUNT(DISTINCT v.id)`; never sum tracks to a total —
totals come from the base eligible set. Stack children of one discipline overlap
each other only in rare multi-language vacancies, and that overlap is correct.

> **NB.** The above counts a stack child by its *own* skill node, not the parent's
> role — so `Backend > Go`'s count is "vacancies with Go skill", not "backend + Go".
> If we want the displayed count to equal the *clicked* (inherited) filter, the
> stack branch must also AND the parent's role criterion. Decide at build time;
> inherited-accurate is the honest choice, the simpler form over-counts children.

## Frontend

**TL;DR.** Replace the flat role list + skill multiselect with one nested track tree
(counts shown, zero hidden, sorted by count) and a contextual skill row under the
selection.

- `getAggregates` adds a `tracks` block from `track_counts`
  (`{ slug, label, parentSlug, count }[]`, `is_active`, `count > 0`, ordered by
  `sort_order` then count). The web renders it as one nested list.
- Clicking a track writes `trackSlug` into `useFilters` (replacing raw `roleId`).
- Under an active selection, render the contextual skill chips; clicking one appends
  to `skillIds`.
- A track with `vacancy_count = 0` is hidden — prominence "lives its own life" by
  live count, exactly the earlier goal.

## Implementation plan

**TL;DR.** Schema → seed the curated tree → counts VIEW → feed param + aggregates →
web tree + contextual chips. Each step is additive; nothing migrates existing rows.

1. **Schema** — add `tracks` + `track_nodes` (drizzle), generate migration. No change
   to `nodes` / `vacancies` / `vacancy_nodes`.
2. **Seed** — `tracks.json`: the curated tree as `{ slug, label, parentSlug?,
   sort_order, nodes: [{type, canonicalName}] }`. Seeder resolves `(type,
   canonicalName)` → node id, idempotent upsert (`onConflictDoUpdate` on
   `label`/`sort_order`/`parent_id`; the current `onConflictDoNothing` would not
   relink). Missing node names fail loudly (curation error).
3. **Counts** — `track_counts` VIEW (above).
4. **API** — `trackSlug` in `ListVacanciesParams` + `buildWhere` resolution; `tracks`
   block in `getAggregates`; scoped contextual-skills query.
5. **Web** — nested track tree component replacing flat role list; contextual skill
   chips under selection; wire `trackSlug` / `skillIds` into `useFilters`.
6. **Deferred** — `is_generic` flag; materialized `track_counts` + post-ingest
   `REFRESH CONCURRENTLY`; alias-redirect of language-named roles (below).

## Why this is OK

**TL;DR.** Additive, no backfill, axes enforced by construction, UI stays one shallow
list, counts drive prominence for free.

- **Zero data migration.** The browse layer is pure references; drop and recreate it
  freely. Existing ~3–4k vacancies appear in the tree the moment their tracks are
  seeded.
- **Two-axis purity is structural, not conventional.** `node.type` makes a wrong
  filter unrepresentable — you can't accidentally filter a discipline via a skill.
- **The user never sees the axes.** One nested list, max two clicks to a stack.
- **Prominence is free and live.** `track_counts` orders chips and hides empties; no
  hand-tuned "popular" list.
- **Recursion risk is contained.** `parent_id` is on 50 curated rows at depth 2, not
  on thousands of moderated nodes.
- **Reuses existing machinery.** `trackSlug` lowers onto the same `role_node_id` /
  `vacancy_nodes` filters and the same top-skills aggregate already in the service.

## Why this is NOT OK (risks / costs)

**TL;DR.** The tree is hand-curated, so it needs maintenance and can silently miss
new roles/skills; overlapping counts are easy to misuse; inheritance is hard-wired
to depth 2.

- **Curation debt.** New roles/skills land in **no track** until someone adds them.
  Vacancies stay in the feed (raw filters) but are invisible in the browse tree.
  → Mitigation: an "untracked roles/skills" audit query surfaced in the dashboard.
- **A language under N disciplines is N curated rows** (`Backend > Go`, `Data > Go`).
  Duplicate maintenance; acceptable at ~40 children, watch it if it grows.
- **Overlapping counts.** Not a partition — summing tracks double-counts. Easy to get
  wrong in analytics; documented above, but it's a footgun.
- **Inheritance is 1-hop.** Hard-wired to depth 2. Going to depth 3 means switching
  resolution to a full ancestor walk (recursive CTE) — a real change, not a config.
- **Semantic split.** Track/contextual chips are OR/refine; raw `skillIds` is AND.
  Two skill mechanisms with different semantics could confuse if both are exposed.
- **Contextual facet is a live aggregate per request.** Cheap now; cache or
  pre-aggregate if it ever shows on every page load at scale.

## How it evolves

**TL;DR.** Each limitation has a pre-planned additive escape hatch; none needs a
redesign.

- **Counts get slow** → `track_counts` becomes a MATERIALIZED VIEW refreshed
  `CONCURRENTLY` at the end of each ingest (your post-ingest task idea). Needs a
  `UNIQUE INDEX (track_id)`.
- **Stack grows past languages** → add framework / cloud children under the same
  tracks; nothing structural changes.
- **Standalone-language demand** → a top-level `Languages` parent grouping the same
  skill children.
- **Contextual facet noisy** → add `is_generic` and exclude flagged skills.
- **Discipline coverage gaps from language-named roles** (`Python Developer` as a
  ROLE) → alias-redirect them to a generic role (decoupled cleanup; the nav layer
  does not require it, but it improves which discipline their vacancies fall under).
- **Deeper hierarchy ever needed** → switch the 1-hop resolver to an ancestor walk;
  the tables already support arbitrary depth.

## Decisions (locked)

**TL;DR.** One nested tree (not two rows, not one role tree); axes = `node.type`;
reject `ltree` and `parent_id`-on-`nodes`; stack curated + count-ordered + hide-zero;
non-tech roles HIDDEN not deleted; ingest filter is a crutch; hardware ≠ language.

- **One nested browse tree, axes hidden from the user.** Two chip rows were rejected
  (a backend dev wouldn't know which row to start in). The axes survive as a
  data-architecture guarantee — structurally, as `node.type`.
- **Reject `ltree`.** Wins only on huge trees with path-subtree queries; here it adds
  slug-label + materialized-path maintenance for zero gain. Additive later if ever.
- **Reject self-referential `parent_id` on `nodes`.** `nodes` holds LLM-extracted
  entities (status, embedding, aliases, moderation). Organizational structure
  doesn't belong there; it lives on `tracks`.
- **Stack = curated set, data-driven prominence.** Curate *which* skills are
  stack-defining; order by live vacancy count; hide zero-count.
- **Non-tech roles → `status='HIDDEN'`, never `DELETE`.** `role_node_id` is FK
  RESTRICT; delete fails if any vacancy points at it. Feed filters `VERIFIED`, so
  HIDDEN drops them naturally.
- **`vacancy-filter.ts` (ingest blacklist/whitelist) is a crutch, not ground truth.**
  Tracks derive from vacancy content, independent of the ingest filter.
- **Hardware is not a language.** A DOMAIN (industry, separate facet), a DISCIPLINE
  (`Embedded & Hardware` track), and the languages it uses (C/C++/Rust = stack
  children) — three hats, kept apart.

## Build decisions — 2026-06-02 (branch impl)

Locked while writing schema + seed. Variant A (lean, languages-only) chosen as base.

- **Schema landed.** `tracks` + `track_nodes` → migration `0012_vengeful_vance_astro.sql`
  (generated, **not yet applied**). Self-ref `parent_id` + `CHECK(parent_id<>id)`,
  `track_nodes` PK(track,node), both FK `ON DELETE CASCADE`.
- **Seed = variant A, 10 disciplines / 34 children.**
  `seeds/data/tracks.variant-a-lean.json`; seeder `seeds/tracks.seed.ts` (idempotent,
  2-pass, fails loud on missing node/parent, re-syncs membership).
- **Stack-child count = inherited** (role ∈ discipline AND skill), not own-skill —
  displayed count == what the click returns. (Resolves the NB under Counts.)
- **`Python Developer` filed under NO discipline.** Data: 33 vac, ~80% backend but
  ~20% data (Airflow tail) — ambiguous. It's a language-named-role extraction
  artifact; real fix = normalize at extraction (parked). `.NET Developer` (44) kept
  under Backend (safe — .NET ≈ backend/enterprise).
- **New discipline `Embedded & Hardware`** — captures `Embedded Software Engineer`
  (156, was untracked!), `Hardware Engineer` (45), `FPGA Engineer` (4). Children =
  languages C / C++; tools (STM32 / RTOS / Altium) live in the contextual facet.
- **`Fullstack` gets broad children** (FE frameworks + BE languages). hide-zero makes
  over-listing self-correcting, so generosity is safe.
- **Facet cleanup = blacklist (`is_generic`), NOT whitelist (`is_core`).** The tree
  already IS the navigation whitelist; the facet's job is uncurated long-tail
  discovery → subtract noise, don't re-curate. Still deferred (ship raw); eventual
  smart form = rank by lift.
- **Admin source-of-truth:** JSON seed = bootstrap only; after first load the **DB is
  truth** and admin edits live (re-running the tracks seed would overwrite them).
  Optional Export-to-JSON closes the git loop.

### ⚠ Pre-merge TODO — local vs prod node divergence
The seed resolves `(type, canonicalName)` against the **live `nodes` table** and was
built against the **local DB**. Prod's VERIFIED set may differ (missing/renamed
canonicals). Two nodes (`C` skill, `Hardware Engineer` role) were added to
`nodes.json` because they existed locally but not in the bootstrap file. **Before
merge:**
- Diff every curated `canonicalName` against prod's VERIFIED nodes (seeder fails loud
  on any miss — run it dry against prod).
- Decide whether prod gets the same `C` / `Hardware Engineer` additions.
- Re-run the "untracked roles/skills" audit on prod numbers (curation gaps differ by
  dataset, so the tree shape may need prod-specific tweaks).

### Inheritance — per-axis override-else-inherit (refined 2026-06-02)

Supersedes the doc's earlier "union ROLE + AND SKILL". Effective filter of a clicked
track `t`:

```
for axis in (ROLE, SKILL):
  eff[axis] = t.nodes[axis]  if non-empty  else  parent(t).nodes[axis]
where = (role_node_id IN eff.ROLE  if eff.ROLE)  AND  (EXISTS vacancy_nodes for each eff.SKILL)
```

- **SKILL child** (`Backend > Go`): ROLE inherited (backend roles), SKILL = {Go} →
  `role∈backend AND skill=Go`. (unchanged behaviour)
- **ROLE child** (`QA > Manual`): ROLE overrides → `role∈{Manual QA Engineer}`. This is
  what enables sub-discipline children (manual/automation) — narrowing *within* the
  same axis, which a union could not express.
- Pure-grouping parent (`By Language`, no own nodes) → own count 0; it renders only
  because children have counts (see hide-zero rule below).

### Seed shape (tracks.json, 2026-06-02)

12 disciplines / 42 children. Three child *patterns* now in use:
- **stack child** (SKILL): `Backend > Go`, `Frontend > React` — narrow by tech.
- **sub-discipline child** (ROLE, override): `QA > Manual`, `QA > Automation`
  ({Automation QA Engineer, SDET}). Mirrors Djinni's `qa_manual` / `qa_automation`.
- **standalone-language group**: top-level `By Language` (no role criterion) →
  `Languages > Rust/Go/Scala/Ruby/Kotlin/C++` = that skill across ALL roles. Mirrors
  Djinni's `keyword-rust`. Coexists with discipline language-children (multi-membership).

### Contextual facet — recompute on TRACK change only (decided 2026-06-02)

Open question "refresh chips on every skill pick?" → **no.** Chips = top-N skills of
the *selected track*, **stable while the user toggles individual skill chips**;
recompute only when `trackSlug` changes. Rationale: per-pick reshuffle is jarring and
costs a query per toggle; per-track is calm, **cacheable per track** (even
precomputable later). Applied chips render pinned/selected, not removed.

### API contract (freeze this — front + back build in parallel)

```ts
// GET /vacancies/tracks  — navigation tree (cacheable; counts unfiltered per track)
type TrackDTO = { slug: string; label: string; parentSlug: string | null;
                  count: number; sortOrder: number };   // response: { tracks: TrackDTO[] }

// GET /vacancies/tracks/:slug/skills  — contextual chips for a track (cacheable)
type ContextualSkill = { id: string; name: string; count: number };  // { skills: [...] }

// GET /vacancies  — existing list, extended
//   request += trackSlug?: string   (coexists with raw roleId/skillIds fallback)
```

- **hide-zero rule (frontend):** hide a node if `count===0` AND it has no visible
  child (so pure-grouping parents like `By Language` still show).
- **tree = single-select** (one active node), **counts inherited + per-track
  independent** (never sum).

**Backend steps:** ✅ all done (2026-06-02). 1) migration 0012 applied · 2)
`track_counts` VIEW (migration 0013, per-axis override-else-inherit) · 3) `seedTracks`
wired into `run.ts` (run standalone vs dev DB — full `db:seed` skipped to avoid
`seedNodes` reverting moderated statuses to VERIFIED) · 4) `GET /vacancies/tracks` ·
5) `trackSlug` resolution in `buildWhere` (grouping tracks → match nothing) · 6)
`GET /vacancies/tracks/:slug/skills` (scoped top-skills, own criteria excluded).
Verified: `list(trackSlug).total` == view count (backend 1134, backend-go 104,
lang-go 164, languages 0). DTOs: `TrackDto`/`ContextualSkill` in `vacancies.contract.ts`.

**Frontend steps:** 1) freeze types above, mock responses · 2) nested track-tree
(replaces flat `RoleSection`) · 3) `trackSlug` into `useFilters`, drop raw `roleId` ·
4) contextual chip row (refetch on track change only).

## Resolved

- **Discipline source — derived, not extracted.** From existing role links via track
  membership. No per-vacancy `discipline` enum (rejected: hardcodes taxonomy into a
  DB type, duplicates ROLE). No backfill.
- **Naming.** `tracks` / `track_nodes` (over `catalog_entries`, `sections`,
  `facets`). Counts view `track_counts`.

## Still open / parked (separate concerns)

- Fix the extraction prompt (remove "default unknown → `Software Engineer`") — its
  own task, unrelated to nav. The `Software Engineer` inflation is decoupled here.
- **Language-named roles** (`Python Developer`, `Python Engineer`, `Java Developer`,
  `WordPress Developer`…) — normalize to a discipline at extraction; until then they
  stay untracked (decoupled from nav). Same family as the prompt fix above.
- `is_generic` flag — **direction locked: blacklist, not whitelist** (see 2026-06-02
  block); build only if the facet is noisy. Smarter eventual form = lift ranking.
- Materialize `track_counts` — only when the live VIEW is slow.

## Out of scope

- `ltree` node hierarchy (see `taxonomy-curation.md` — already de-scoped).
- Framework / cloud stack children (languages-only to start).
- Embedding-based node clustering. "Lift"-based contextual ranking.

## Links

- Schema: `libs/database/src/schema/nodes.ts`, `vacancies.ts`, `vacancy-nodes.ts`,
  seed `libs/database/seeds/data/nodes.json`
- Feed filter / aggregates: `apps/etl/src/vacancies/vacancies.service.ts`
- Filter UI: `apps/web/components/data/vacancy-filters/`
- Prior taxonomy work: `taxonomy-curation.md`, `taxonomy-workspace.md`
- Ingest crutch: `apps/etl/src/rss/utils/vacancy-filter.ts`
