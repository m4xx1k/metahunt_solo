# taxonomy-kind-map — one `kind` column, one direction map, curation that scales

**Branch:** `feat/taxonomy-kind-map`
**Status:** planned 2026-09-05 — steps 0-2 ready to implement, 3-4 need a checkpoint
**Linear:** MET-145 (the `kind` split), MET-121 (the map UI), MET-27 (subsumption — explicitly NOT in scope)

## Why

`nodes.status` answers two questions with one value: "is this real?" and "should
it appear as a filter chip?". `node_stats` excludes `HIDDEN`, so hiding a node
to keep the filter rail clean also deletes it from matching.

Measured on prod 2026-09-04 — what is sitting in `HIDDEN` (200 SKILL nodes, top
by `vacancy_nodes` links):

| node | links | what it actually is |
|---|---|---|
| NoSQL | 286 | generic but real |
| NumPy | 256 | **a library — hidden by mistake** |
| API | 235 | generic |
| Distributed Systems | 176 | concept worth scoring |
| Zustand | 143 | **a library — hidden by mistake** |
| Event-Driven Architecture | 123 | concept worth scoring |
| Clean Architecture | 65 | concept worth scoring |
| System Design | 61 | concept worth scoring |
| AI tools | 103 | genuine junk |

Three different verdicts in one bucket. The fix is not another status — it is a
second, orthogonal column saying **what kind of thing the node is**, so the
filter rail can select on that instead of on visibility.

`status` keeps its current three values and its current meaning. There is no
rename in this tracker.

### Why a map and not an edit form

`node_tech_meta.is_core` is global, and therefore near-useless: 42 rows true out
of 1224. `Python` is core for data and peripheral for devops; one boolean cannot
say that. But **inside one direction, core is just the top of the df ranking** —
it does not need a flag at all, it needs a view.

Working set per direction, measured on prod (`df` = within that direction):

| track | positions | distinct skills | df >= 20 | df >= 50 |
|---|---|---|---|---|
| backend | 2333 | 1988 | 153 | 76 |
| devops | 1925 | 2206 | 155 | 75 |
| data-ai | 1999 | 1686 | 157 | 77 |
| qa | 2024 | 1263 | 129 | 56 |
| fullstack | 1433 | 1148 | 108 | 53 |
| hardware | 1131 | 1331 | 119 | 55 |
| frontend | 589 | 663 | 46 | 23 |
| mobile | 530 | 803 | 53 | 17 |
| security | 354 | 785 | 44 | 13 |
| gamedev | 100 | 328 | 6 | 1 |
| blockchain | 28 | 101 | 0 | 0 |

**~150 tiles per direction, not 10k nodes.** That is one screen and one evening,
and each direction closes independently. The map takes any track, discipline or
child, so `hardware` can be curated as one screen or split into `hw-embedded`
(895 skills) and `hw-hardware` (669) when firmware and circuit design stop
belonging together. Embedded / defence work lives here — there is no separate
miltech track and none is being added.

## Not in scope

Named here so they do not leak in:

- scoring multipliers (`is_core` 1.2 / `generic` 0.8) — matching module
- weekly `node_stats` snapshots for digests — market module
- flattening the browse entry to one click — profile module
- `stack` as an enum instead of free text — later, if ever
- subsumption edges (MET-27) — later
- renaming `HIDDEN`

---

## Step 0 — local data (no code)

```bash
scripts/db-backup.sh                        # dump Railway
pnpm docker:infra && scripts/db-restore.sh  # restore into local Postgres
```

Then clear the 98 mechanical duplicates: nodes whose `normalizeAliasName` key
already maps to a *different* node via `node_aliases` (`CosmosDB` / `Cosmos DB`,
`ClaudeCode` / `Claude Code`, `AlpineJS` / `Alpine.js`, `Async IO` / `asyncio`).
They carry 106 links total. Residue from before alias normalisation landed.

Query that finds them:

```sql
WITH k AS (
  SELECT n.id, n.type, n.canonical_name,
         lower(regexp_replace(n.canonical_name, '[[:space:]_./-]+', '', 'g')) AS key
  FROM nodes n
)
SELECT k.type, k.canonical_name, a.name
FROM k JOIN node_aliases a
  ON a.name = k.key AND a.type = k.type AND a.node_id <> k.id;
```

Emit them as a plan file (`plans/skill-dupes-v2.plan.json`, existing `merge` op),
dry-run, then `--apply` locally. Do **not** apply to prod in this step.

## Step 1 — the `kind` column

`libs/database/src/schema/nodes.ts`:

```ts
export const nodeKind = pgEnum("node_kind", ["TECH", "CONCEPT", "SOFT"]);
// nullable on purpose: NULL = not classified yet = a grey tile on the map
kind: nodeKind("kind"),
```

`pnpm db:generate`, then a data migration that seeds it from the classification
that already exists — **no LLM pass needed**:

```
LANGUAGE | FRAMEWORK | LIBRARY | DATASTORE | CLOUD | TOOL  ->  TECH
PRACTICE                                                  ->  CONCEPT
SOFT                                                      ->  SOFT
```

That classifies 1224 nodes in one UPDATE. The remaining ~8900 stay NULL; they
are the long tail and the map is how they get picked up, if ever.

The mapping is wrong on roughly 50 nodes: protocols and buses (`I2C` df 362,
`SPI` 356, `UART` 401, `CAN` 253, `TCP/IP` 273, `Ethernet` 116) are classified
`PRACTICE` today but are as concrete as PostgreSQL. They land as `CONCEPT` and
get corrected by hand on the `hardware` map. Do not try to fix them with regex.

**Naming collision to fix in the same PR:** `TaxonomyCoverage.byKind` already
exists and means `required | optional`. Rename it to `byRequirement`
(`taxonomy.service.ts`, `taxonomy.contract.ts`, `apps/web/lib/api/taxonomy.ts`,
`AnalyticsStrip.tsx`) so there is exactly one meaning of "kind" in the codebase.

## Step 2 — `track_node_stats` view

New `pgView` in `libs/database/src/schema/`, columns `(track_slug, node_id, df)` —
`df` counted **within that track**, which is the number the map sizes tiles by.

Covers **all 55 tracks**, disciplines and their children alike. `hw-embedded`
(895 distinct skills) and `hw-hardware` (669) are genuinely different skill
populations and curating them as one `hardware` screen would mix firmware with
circuit design; the same holds for `backend` vs `backend-go`. Making the view
discipline-only would mean rebuilding it later.

Track resolution mirrors `track_counts` exactly — own `track_nodes` ROLE/SKILL
ids, falling back to the parent's, role must be VERIFIED:

```sql
WITH own AS (
  SELECT tn.track_id,
         array_agg(tn.node_id) FILTER (WHERE n.type = 'ROLE')  AS role_ids,
         array_agg(tn.node_id) FILTER (WHERE n.type = 'SKILL') AS skill_ids
  FROM track_nodes tn JOIN nodes n ON n.id = tn.node_id
  GROUP BY tn.track_id
),
eff AS (
  SELECT t.id, t.slug,
         COALESCE(o.role_ids,  po.role_ids)  AS role_ids,
         COALESCE(o.skill_ids, po.skill_ids) AS skill_ids
  FROM tracks t
  LEFT JOIN own o  ON o.track_id  = t.id
  LEFT JOIN own po ON po.track_id = t.parent_id
),
pos AS (
  SELECT e.slug, p.position_id
  FROM eff e JOIN positions p ON TRUE
  WHERE p.role_node_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM nodes rn
                WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED')
    AND (e.role_ids IS NULL OR p.role_node_id = ANY(e.role_ids))
    AND (e.skill_ids IS NULL OR EXISTS (
          SELECT 1 FROM position_nodes pn
          WHERE pn.position_id = p.position_id
            AND pn.node_id = ANY(e.skill_ids) AND pn.is_required))
)
SELECT pos.slug AS track_slug, pn.node_id, count(*)::int AS df
FROM pos
JOIN position_nodes pn ON pn.position_id = pos.position_id
JOIN nodes n ON n.id = pn.node_id AND n.type = 'SKILL'
GROUP BY 1, 2
```

Plain view, not materialised. Measured against prod 2026-09-05: **1.1 s, 28,931
rows, all 55 tracks**. Materialise only if the page is visibly slow, and treat
that as a separate decision (it needs a UNIQUE index and a refresh hook).

Expected row counts to verify against (`df` within track):

| track | distinct skills | df >= 20 | df >= 10 |
|---|---|---|---|
| backend | 1988 | 153 | 246 |
| hardware | 1331 | 119 | 188 |
| hw-embedded | 895 | 82 | 135 |
| frontend | 663 | 46 | 79 |
| hw-hardware | 669 | 48 | 76 |
| frontend-react | 450 | 30 | 43 |
| backend-go | 426 | 28 | 42 |
| gamedev | 309 | 4 | 14 |
| hw-fpga | 116 | 1 | 7 |

**Checkpoint after step 2.** Everything above is mechanical and safe to do
unattended. Everything below involves product judgement.

## Step 3 — API

Extend the existing `TaxonomyController` (`apps/etl/src/admin/taxonomy/`):

```
GET   /admin/taxonomy/map?track=<slug>&limit=<n>
      -> [{ id, name, kind, status, df, aliasCount }]

PATCH /admin/taxonomy/nodes/:id/kind   { kind: "TECH"|"CONCEPT"|"SOFT"|null }
```

`limit` is **top-N by `df` within the track**, default 150 — not a fixed `df`
threshold. A threshold that gives `backend` 153 tiles gives `hw-fpga` one; top-N
keeps every track's screen the same size and workable. The UI exposes it (step
4), so the API just validates it like the other query params
(`taxonomy-query.parser.ts` is the pattern). `track` validates against
`tracks.slug`.

`verify`, `hide`, `rename`, `merge-into` already exist — reuse them unchanged.

## Step 4 — the map page

`apps/web/app/dashboard/taxonomy/map/page.tsx`, alongside the existing curator
list — not replacing it.

- track selector: 11 disciplines, each expandable to its children (55 total)
- size selector: top **50 / 150 / 300** by `df`, default 150
- tile grid, tile area proportional to `sqrt(df)`
- colour by `kind`; **grey = NULL**; dashed border = currently `HIDDEN`
- header progress: `classified 118 / 150`

Interaction:

```
click        kind cycles TECH -> CONCEPT -> NULL
s            set SOFT          (kept out of the cycle — 2 nodes carry it)
h            hide
shift+click  merge into...     (reuse VerifiedSearch)
```

**The load-bearing detail:** setting a `kind` on a tile that is currently
`HIDDEN` also calls `verify`. Un-junking `HIDDEN` is then a side effect of
laying out the map, not a separate pass. One gesture, both problems.

## Step 5 — curation (no code)

`backend` first (153 tiles), then `data-ai`, `devops`, `hardware`, `qa`. Each
direction is independent and blocks nothing.

## Step 6 — reaching prod

Every mutating `TaxonomyService` call appends a line to
`.private/journal/taxonomy-curation.jsonl`. A small script turns that journal
into a normal plan file (needs one new op, `set-kind`; the rest exist), which
replays against prod:

```bash
DATABASE_URL=$(scripts/prod-db-url.sh) pnpm taxonomy:migrate --plan <path> --apply --yes-prod
```

Why not curate prod directly: the read-only rule stays intact, there is a
dry-run before anything lands, and the journal is the audit trail MET-121 asked
for, for free.

**Ship `AND kind = 'TECH'` on the filter rail in the same release.** Otherwise
the concepts just recovered from `HIDDEN` appear as filter chips for users.

---

## Done when

- `nodes.kind` exists, 1224 nodes seeded from `node_tech_meta.category`
- `track_node_stats` returns all 55 tracks and matches the counts table above
- the map renders `backend` and a click changes a node's `kind`
- `backend` has zero grey tiles in its top 150 by `df`
- prod filter rail selects on `kind = 'TECH'`, concepts score in `node_stats`
