# lab-constellation — Rebuild the skill map as a live constellation

**Branch:** `feat/lab-constellation`
**Status:** in-progress
**Started:** 2026-08-27 · **Closed:** —

## Outcome

*(fill in when closing — 1–5 lines: what shipped, what changed, what's deferred)*

## Why this exists

`apps/lab`'s skill map is slow and hard to read, and the two problems have the same
root: the layout is precomputed synchronously and then frozen. ForceAtlas2 blocks the
main thread for ~650 ms on every filter change, the renderer is destroyed and rebuilt
on every click, and the result is a static hairball of 432 nodes.

The rebuild replaces that core with a continuously-simulated "constellation" — the
whole graph always in motion, hover lights a neighbourhood, click flies the camera in.
The dossier, FAQ, roles page and methodology are kept as they are.

**Out of scope:** candidate archetypes (the MET-135 destination). This initiative
exists to leave a data layer that can be trusted and a map that can be read, which is
what makes the archetype work approachable afterwards. Do not start it here.

## Guardrails — read before editing

These are load-bearing. Breaking one is silent.

1. **Never rename a lab script** to `dev` / `build` / `lint` / `test`. Script naming
   (`lab`, `lab:build`, `lab:check`, `lab:data`, `lab:relations`) is the entire
   mechanism that keeps this app out of `pnpm dev`, `pnpm lint` and `pnpm build:all`.
   See ADR-0014.
2. **Never rename the `metahunt_lab` database** or relax the guard in
   `apps/lab/pipeline/psql.sh`. It refuses any `LAB_DATABASE_URL` whose database is not
   literally `metahunt_lab`, which is what stops a lab query reaching prod (MET-133).
3. **Never put `DATABASE_URL` in `apps/lab/.env`.** The lab reads `LAB_DATABASE_URL`
   and only that; a `DATABASE_URL` there silently retargets every other command in the
   repo.
4. **Never regenerate `src/data/pair-relations.json`.** It is hand-curated judgement —
   the golden set itself. It is edited by hand or not at all.
5. **After T2, never `import` a data file.** `import x from "./data/*.json"` inlines it
   into the JS bundle. Use `fetch`.

## Measurements this plan is built on

Taken 2026-08-27 against `apps/lab` at `f6601cf`.

| Fact | Value |
|---|---|
| Corpus | 2026-05-08 → 2026-08-27, 14,062 eligible positions |
| Graph | 452 nodes, 4,741 edges, 14 roles |
| Drawn at default NPMI ≥ 0.3 | 432 nodes, 1,668 edges |
| Worst case NPMI ≥ 0.1 | 446 nodes, 3,049 edges |
| Degree distribution | median 11 · p90 49 · max 254 (Python) |
| ForceAtlas2, 600 iterations | **652 ms, blocking, main thread** |
| Louvain | 2–7 ms (never the slow part) |
| `graph.json` | 842 KB — edges 418 (49.7%), roles 342 (40.6%), nodes 80 (9.6%) |
| JS bundle | 1.15 MB, of which ~86% is the inlined artifact |
| Edges re-encoded as rounded tuples | 418 KB → 160 KB (−62%) |

Reproduce the layout timing with `graphology-layout-forceatlas2` over the artifact at
600 iterations; reproduce the size numbers with `JSON.stringify` per top-level key.

## Decisions (locked 2026-08-27)

**Kept, against an earlier proposal to cut them.** The cluster picker, the NPMI
slider, the relations graph and the roles page all stay. The NPMI slider was never the
problem — the precomputed layout behind it was.

**Cut.** The Experiments sandbox (view, `data/experiments/`, `charts/BubbleChart.tsx`,
`pipeline/05-domain-axes.sql`, `pipeline/06-export-domain-axes.sql`); the side/bottom
placement toggle and the labels toggle; `@react-sigma/core` and `graphology-metrics`
(both in `package.json`, imported nowhere).

**Engine — `react-force-graph-2d`, provisional until T3's gate.** Chosen against the
constellation's requirements, not general merit:

- `d3AlphaDecay(0)` with a small `d3AlphaTarget` keeps the simulation warm forever, so
  the drift is the physics rather than an animation layered on top;
- `nodeCanvasObject` paints each node per frame, so dim / highlight / labels all use
  the lab's existing CSS tokens directly;
- `centerAt(x, y, ms)` and `zoom(k, ms)` make the fly-in two calls;
- labels are plain canvas text under our own rules — the requirement that rules out
  cosmos.gl, whose weakest area is label rendering and which is built for 100k+ nodes
  we do not have.

Import from `react-force-graph-2d`, never the umbrella `react-force-graph` — the
latter pulls three.js for 3D/VR variants we will not use.

Sigma + the FA2 worker (`graphology-layout-forceatlas2/worker.js`, already present and
unused) remains the fallback if T3's gate fails and cosmos.gl is rejected.

**Identity moves to the UUID.** `pair-relations.json` is keyed by skill *name* because
node indices shift per rebuild — but every node already carries a stable database UUID
(`nodes[].id`). Keying on it retires the whole rename-drift class. The 2026-08-27
refresh orphaned two labels (`TCP` → `TCP/IP`, and an Analog/Digital Circuit Design
merge) purely because of this.

**Way back is `main`.** No feature flags, no parallel routes. `main` keeps a working
lab for the whole rebuild; this branch either wins or is abandoned.

**The database does not change.** `metahunt_lab` keeps its name (guardrail 2). The
dump at `~/backups/metahunt/prod-full-20260827T123235Z.dump` is the frozen reference
point for reproducing the artifact.

## Subtasks

- [x] **T0 — Land what works, then branch** — *done when:* PR #200 is merged;
      `feat/lab-constellation` exists off the new `main`; `lab:build`, `lab:check` and
      `lab:relations` are green on it.

  PR #200 (skill dossier, FAQ, and the 2026-08-27 data refresh) is already green.
  Merge it so the rebuild starts from a clean single-purpose branch rather than
  stacking on a draft PR.

  **Done 2026-08-27.** #200 squash-merged to `main` as `d6c697c`; `feat/lab-constellation`
  cut off it. On the branch: `lab:build` exit 0 (bundle 1,155 kB), `lab:check` exit 0,
  `lab:relations` exit 0 ("no drift"; 26 top-150 edges still unlabelled — known
  follow-up curation, not blocking).

- [ ] **T1 — Subtract, and fix the invisible file** — *done when:*
      `file apps/lab/src/views/Relations.tsx` reports text, not `data`; a ripgrep-style
      search for `sigma` finds **both** `Map.tsx` and `Relations.tsx`; build and lint green.

  **Do the NUL fix first.** `Relations.tsx` contains a raw U+0000 byte at offset 1422
  (line 33), where the pair key joins with a literal zero byte instead of an escape:

  ```ts
  const key = (a: string, b: string) => [a, b].sort((x, y) => x.localeCompare(y)).join(<RAW NUL>);
  ```

  Replace the raw byte with the escape `"\u0000"` — identical behaviour, but visible
  in an editor and findable by every search tool. It is committed, and the consequence is tooling, not runtime: `file`
  classifies the source as binary `data`, so every search that skips binaries skips
  this file **silently**. Several searches during the audit returned clean on it and
  were wrong. Every later phase depends on being able to search the codebase.

  Then delete Experiments and its data, chart, types and two pipeline SQL files;
  remove the placement and labels toggles; drop `@react-sigma/core` and
  `graphology-metrics`. No design decisions in this phase.

- [ ] **T2 — Rebuild the artifact, keep the numbers** — *done when:* a fixed set of
      edges renders identical numbers before and after; the eager payload is under
      100 KB; `lab:relations` reports zero orphans by construction.

  Re-key curated labels onto `nodes[].id` (update `pipeline/relations-check.mjs` with
  it) and fold the relation into the edge at export time in `pipeline/04-export.sql`.
  Split the artifact, tuple-encode and round, add an adjacency index and a precomputed
  `top[8]`, and switch `import` → `fetch`:

  ```
  core.json    ~95 KB  eager       nodes[] (id, name, support, prevalence, deg, top[8])
                                   + contract + provenance + relationLabels
  edges.json  ~160 KB  after mount edges[] as [a,b,pairs,pBgivenA,pAgivenB,lift,npmi,rel]
                                   + adj{} node index → edge indices
  roles.json  ~120 KB  on demand   role marginals + in-role pair counts
  ```

  Drop from every node: `stack`, `isCore`, `generic`, `category`, `slug` — shipped 452
  times, read by nothing once Experiments is gone (verified with GNU grep, not the
  binary-skipping kind).

  **The old UI keeps running against the new files throughout this phase.** That is the
  point: if any rendered number moves, the encoding is wrong.

- [ ] **T3 — Prove the engine before committing to it** — *done when:* a throwaway page
      holds ≥ 60 fps warm at the 446-node / 3,049-edge worst case, or the engine
      decision is reopened.

  Before any product code: mount `react-force-graph-2d` with the real artifact at
  NPMI ≥ 0.1, keep the simulation warm, and measure frame time. This gate exists so a
  wrong engine costs an hour rather than a rewrite. If it fails, cosmos.gl becomes the
  answer with hand-built labels as its known cost, or edges get capped by NPMI rank.

- [ ] **T4 — Build the constellation** — *done when:* one graph engine remains in
      `package.json`; dragging the NPMI slider never blocks; clicking a drifting node
      lands first time.

  One `<Constellation>` component covering all six behaviours:

  | Behaviour | Rule |
  |---|---|
  | Rest | All nodes present and drifting. Colour = Louvain cluster, radius = support. Labels only above a degree threshold. |
  | Hover | Hovered node + neighbours keep colour and gain labels; everything else drops to low-alpha ink. **Pause the simulation on hover** — a drifting target is hard to click. |
  | Click | `centerAt` + `zoom` over ~600 ms. The dossier already reacts to `selected` and needs no change. |
  | NPMI slider | Adds/removes links and lets the sim re-settle in view. No recompute, no freeze. |
  | Cluster picker | Lifts the chosen cluster and pushes the rest back rather than deleting them. |
  | Reduced motion | Under `prefers-reduced-motion` the sim settles once and stops; the camera flight becomes a cut. |

  Then point the Relations graph at the same component with the curated pair subset,
  and remove `sigma` and `graphology-layout-forceatlas2` from the repo. Keep
  `graphology` and `graphology-communities-louvain` — Louvain stays at runtime because
  it costs 2–7 ms.

- [ ] **T5 — Judge it against main** — *done when:* you would rather use the new one;
      the reduced-motion path works; both light and dark themes hold.

  Run old and new side by side and decide honestly whether the constellation *reads*
  better, not just whether it looks better. Then write the ADR recording the engine
  choice (it is provisional until here), update `md/architecture/overview.md` if the
  shape changed, add a `md/journal/releases.md` paragraph, and open the PR.

## Risks

| Risk | Caught by | If it happens |
|---|---|---|
| Main-thread sim too slow | T3's spike, before product code exists | cosmos.gl with hand-built labels, or cap drawn edges by NPMI rank |
| Perpetual drift is annoying, not magic | T5's side-by-side | Drop `alphaTarget` until barely perceptible, or settle after a few seconds and wake on interaction |
| 452 labels read as noise | First render of T4 | Labels earned by degree and zoom, never all at once — the toggle removed in T1 was solving this the lazy way |
| It looks alive but says less | T5, and only by being honest | The dossier stays the reading surface throughout, so the fallback is a good map beside a panel that still answers the question |

## Commands

```bash
pnpm --filter @metahunt/lab lab           # dev server on :4200
pnpm --filter @metahunt/lab lab:build     # tsc -b && vite build
pnpm --filter @metahunt/lab lab:check     # oxlint
pnpm --filter @metahunt/lab lab:relations # curated-label coverage + drift; exits 1 on drift
pnpm --filter @metahunt/lab lab:data      # regenerate the artifact from metahunt_lab
```

The lab database runs in the `metahunt-db` docker container on port 54323 (needs
Docker Desktop's WSL integration enabled). To rebuild it from the frozen dump:

```bash
docker exec metahunt-db psql -U metahunt -d postgres -c "DROP DATABASE IF EXISTS metahunt_lab"
docker exec metahunt-db psql -U metahunt -d postgres -c "CREATE DATABASE metahunt_lab OWNER metahunt"
pg_restore -d "$LAB_DATABASE_URL" --no-owner --no-acl -j4 \
  ~/backups/metahunt/prod-full-20260827T123235Z.dump
```

## Decisions

*Inline notes too small for an ADR. If one grows past ~10 lines, promote it to
`md/journal/decisions/`.*

- The engine choice is deliberately **provisional** until T3's gate passes. Write the
  ADR in T5, once it is proven, not before.
- Louvain stays at runtime rather than moving to build time: it is 2–7 ms, and the
  clusters depend on the NPMI threshold the user is dragging.
- Roles are kept in full. In-role lift is the only confounder control in the lab —
  Docker/Kubernetes falls from lift 3.63 globally to 1.19 inside DevOps — so removing
  it would let every global lift be over-read.

## Links

- ADRs: [0014 — Skill graph and the lab](../decisions/0014-skill-graph-and-the-lab.md)
- Related tracker: [met-135 — lab roadmap](met-135-lab-roadmap-from-a-skill-graph-to-the-candidate-archetypes.md) (T2 there — archetypes — stays out of scope here)
- PR (base to merge first): #200
- PR: —
