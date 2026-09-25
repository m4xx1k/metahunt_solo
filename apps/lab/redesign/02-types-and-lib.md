# Phase 2 — types and graph helpers

Two files: `apps/lab/src/types.ts` and `apps/lab/src/lib/graph.ts`. Make exactly these
edits. Each "replace" names text that exists verbatim in the file today; if it does not,
stop (rule 8).

## 2.1 `src/types.ts`

**(a)** In `SkillNode`, after the line `generic: boolean | null;` add:

```ts
  kind: "TECH" | "CONCEPT" | "SOFT" | null;
```

**(b)** Directly above `/** Endpoints are indices into \`nodes\`...` add:

```ts
/** Verdict from anyOf groups: the share of a pair's positions that offered the two
 *  skills as alternatives ("A or B"), cut at contract.substituteMin / complementMax. */
export type ObservedRelation = "SUBSTITUTE" | "MIXED" | "COMPLEMENT";

```

**(c)** In `Edge`, after the line `npmi: number;` add:

```ts
  substitutePairs: number;
  substituteRate: number;
  /** NPMI over "A and B" positions only; null when the pair was never asked for together. */
  complementNpmi: number | null;
  observed: ObservedRelation;
```

**(d)** Replace

```ts
export type RoleEdge = Omit<Edge, "npmi">;
```

with

```ts
export type RoleEdge = Pick<Edge, "a" | "b" | "pairs" | "pBgivenA" | "pAgivenB" | "lift">;
```

(Role edges are exported without the new fields; `Omit` would now wrongly claim them.)

**(e)** In `Contract`, after `requirementLayer: string;` add:

```ts
  cohort: string;
  substituteMin: number;
  complementMax: number;
```

**(f)** In `Provenance`, after `nPositions: number;` add:

```ts
  cohortPositions: number;
```

**(g)** In `Graph`, after `roles: Role[];` add:

```ts
  /** Every VERIFIED skill name, including those below the support floor. */
  vocabulary: string[];
```

**(h)** Replace the whole `Neighbour` type (from `/** A neighbour of a selected skill`
to the closing `};` at the end of the file) with:

```ts
/** A neighbour of a selected skill, resolved for display. */
export type Neighbour = {
  node: SkillNode;
  index: number;
  pairs: number;
  /** Positions asking for both ("and") — `pairs` minus the "or" positions. */
  together: number;
  /** together / support(selected): always oriented away from the selected skill. */
  p: number;
  substitutePairs: number;
  substituteRate: number;
  observed: ObservedRelation;
  lift: number;
  npmi: number;
};
```

## 2.2 `src/lib/graph.ts`

**(a)** Directly above `/** Orient an edge away from the selected skill` add:

```ts
/** Share of the selected skill's positions that also require the other one — "and"
 *  only: positions offering the two as alternatives are left out. */
export function togetherShare(graph: Graph, e: Edge, selected: number): number {
  return (e.pairs - e.substitutePairs) / graph.nodes[selected].support;
}

```

**(b)** Replace the doc comment of `neighboursOf`:

```ts
/** Orient an edge away from the selected skill: `p` always reads
 *  P(neighbour | selected), never the other direction. */
```

with

```ts
/** Orient an edge away from the selected skill: `p` always reads
 *  P(neighbour required too | selected), never the other direction. */
```

**(c)** In `neighboursOf`, replace the whole `out.push({ ... });` call with:

```ts
    out.push({
      node: graph.nodes[other],
      index: other,
      pairs: e.pairs,
      together: e.pairs - e.substitutePairs,
      p: togetherShare(graph, e, index),
      substitutePairs: e.substitutePairs,
      substituteRate: e.substituteRate,
      observed: e.observed,
      lift: e.lift,
      npmi: e.npmi,
    });
```

Leave the `if (e.pairs < minPairs) continue;` line as it is.

Nothing else in `lib/graph.ts` changes.

## 2.3 Verify

```bash
pnpm --filter @metahunt/lab lab:build
pnpm --filter @metahunt/lab lab:check
```

Both must exit 0. `lab:check` may print warnings that already existed on `main`; it must
not print new ones in the two files you touched.

## 2.4 Commit

```bash
git add apps/lab/src/types.ts apps/lab/src/lib/graph.ts
git commit -m "feat(lab): types and neighbour helpers for substitute/complement edges"
```
