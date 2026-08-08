# 004 — Graph v0 artifact and the Metalab UI

**Question.** Ship the smallest end-to-end research system: a reproducible artifact plus an internal screen where a skill's position-grain neighbourhood can be inspected with its evidence visible.

**Run.**
```bash
analytics/lab.sh -tAf analytics/experiments/004-graph-v0/export.sql \
  | tail -n +2 > apps/web/lib/metalab/graph-v0.json
```
Depends on the tables built by [002](../002-position-skill-pairs/) and `metalab_position_meta` from [003](../003-confounders/).

---

## Why a committed artifact instead of a live endpoint

Production is read-only for this task and the mandatory-group contract only landed mid-run (MET-128), so an endpoint whose grain depends on it would have been shipping ahead of its foundation. A committed file also means:

- the screen and the numbers that were actually reviewed cannot drift apart;
- rendering Metalab touches no production system;
- the whole graph is reproducible from one SQL file against a known dump.

The trade-off is that the graph is only as fresh as the snapshot. That is the right trade for exploratory v0 and the wrong one for anything user-facing — a live endpoint is the natural follow-up once the numbers are trusted.

## Artifact shape

`apps/web/lib/metalab/graph-v0.json`, 795 KB.

```text
contract      grain, eligibility, requirement layer, thresholds, liveness claim
provenance    snapshot, corpus span, denominators, generatedAt, source experiment
sensitivity   rep-vs-union link counts and edge deltas (from 002)
sources       djinni 7,265 · dou 5,498 positions
nodes    420  id, name, slug, support, prevalence, category, stack, isCore, generic
edges  4,140  a, b, pairs, pBgivenA, pAgivenB, lift, npmi
roles     11  name, positions, and 3,331 role-conditioned edges
```

Edges address nodes by **index into `nodes`**, not by UUID — two 36-char ids per edge dominated the file, and the swap cut it from 1.4 MB to 795 KB.

Role edges carry lift but not NPMI: NPMI needs the segment's own marginal distribution and would be misleading to compare against the global column. The UI disables NPMI sorting inside a role rather than silently sorting on a missing field.

## The UI

`/dashboard/metalab` — inside the existing console, not a new frontend.

| file | role |
|---|---|
| `apps/web/lib/metalab/graph.ts` | typed accessors: `findNode`, `searchNodes`, `findRole`, `neighborhood` |
| `apps/web/lib/metalab/graph.spec.ts` | artifact-integrity + accessor tests |
| `app/dashboard/metalab/page.tsx` | server component; all state in the URL |
| `_components/SkillPicker.tsx` | search + selection |
| `_components/Controls.tsx` | role segment, sort metric, pair floor |
| `_components/NeighborGraph.tsx` | radial SVG neighbourhood, no graph library |
| `_components/NeighborTable.tsx` | evidence-first table |
| `_components/Methodology.tsx` | contract, limitations, robustness |

Design decisions worth arguing with:

- **Neighbourhood, never the whole graph.** 420 nodes and 4,140 edges rendered at once is a hairball that communicates nothing. One focus skill, ≤18 neighbours.
- **Radius encodes association, dot size encodes prevalence, line weight encodes pair count.** So a thin line to a close node reads immediately as "strong but thinly evidenced".
- **Raw counts sit left of every normalized number.** A lift of 315 is meaningless until the 31 positions behind it are visible.
- **Server-rendered SVG, zero client JS.** No graph library, no bundle cost, and the page works with the artifact alone.
- **State lives in the URL**, so a finding can be pasted into Linear as a link.

`neighborhood()` always reports `P(neighbour | focus)` regardless of which side the focus was stored on — the pair table stores `a < b` by index, and getting this backwards would silently invert every asymmetric reading. There is a test for exactly that.

## What the screen deliberately does not do

No "skills to learn", no ranking of skills by value, no trend line, no liveness. The TensorFlow/PyTorch case in [003](../003-confounders/README.md) is the reason: the strongest-looking edges include substitutes, so any prescriptive layer needs a substitute gate that does not exist yet.
