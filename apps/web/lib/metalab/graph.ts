import raw from "./graph-v0.json";

// Metalab v0 — an OBSERVED-ASSOCIATION graph over MetaHunt's own corpus at
// canonical position grain. Not a labour-market model and not advice.
// Built by analytics/experiments/004-graph-v0/export.sql (MET-129).

export type MetalabNode = {
  id: string;
  name: string;
  slug: string | null;
  support: number;
  prevalence: number;
  category: string | null;
  stack: string | null;
  isCore: boolean | null;
  generic: boolean | null;
};

// Edges address nodes by index into `nodes`, not by uuid — it keeps the
// artifact a third of the size it would otherwise be.
export type MetalabEdge = {
  a: number;
  b: number;
  pairs: number;
  pBgivenA: number;
  pAgivenB: number;
  lift: number;
  npmi?: number;
};

export type MetalabRole = {
  id: string;
  name: string;
  positions: number;
  edges: MetalabEdge[];
};

export type MetalabGraph = {
  contract: {
    grain: string;
    positionSkillRule: string;
    skillEligibility: string;
    requirementLayer: string;
    livenessClaim: string;
    minSkillSupport: number;
    minPairSupport: number;
    minRolePositions: number;
  };
  provenance: {
    snapshot: string;
    corpusStart: string;
    corpusEnd: string;
    postings: number;
    positions: number;
    nPositions: number;
    generatedAt: string;
    experiment: string;
    issue: string;
  };
  sensitivity: {
    repSkillLinks: number;
    unionSkillLinks: number;
    unionPositions: number;
    unionOnlyEdges: number;
    repOnlyEdges: number;
  };
  sources: { code: string; positions: number }[];
  nodes: MetalabNode[];
  edges: MetalabEdge[];
  roles: MetalabRole[];
};

export const graph = raw as MetalabGraph;

export type SortMetric = "npmi" | "lift" | "pairs" | "conditional";

// One neighbour as the table renders it: the raw evidence first, the
// normalized metrics after. `lift`/`npmi` are undefined inside a role segment
// when the artifact does not carry them.
export type Neighbor = {
  node: MetalabNode;
  pairs: number;
  pGiven: number;
  pReverse: number;
  lift: number;
  npmi?: number;
};

export type Neighborhood = {
  focus: MetalabNode;
  focusSupport: number;
  neighbors: Neighbor[];
  denominator: number;
  scopeLabel: string;
  truncated: boolean;
};

export function findNode(slugOrName: string): MetalabNode | null {
  const needle = slugOrName.toLowerCase();
  return (
    graph.nodes.find((n) => n.slug === needle) ??
    graph.nodes.find((n) => n.name.toLowerCase() === needle) ??
    null
  );
}

export function searchNodes(query: string, limit = 12): MetalabNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return graph.nodes.slice(0, limit);
  return graph.nodes.filter((n) => n.name.toLowerCase().includes(needle)).slice(0, limit);
}

export function findRole(roleId: string | null): MetalabRole | null {
  if (!roleId) return null;
  return graph.roles.find((r) => r.id === roleId) ?? null;
}

const COMPARATORS: Record<SortMetric, (a: Neighbor, b: Neighbor) => number> = {
  npmi: (a, b) => (b.npmi ?? -1) - (a.npmi ?? -1),
  lift: (a, b) => b.lift - a.lift,
  pairs: (a, b) => b.pairs - a.pairs,
  conditional: (a, b) => b.pGiven - a.pGiven,
};

/**
 * The neighbourhood of one skill, inside the global corpus or inside a role.
 *
 * Direction matters: `pGiven` is always P(neighbour | focus), so the caller
 * never has to work out which end of the stored pair the focus sat on.
 */
export function neighborhood(
  focus: MetalabNode,
  opts: { role?: MetalabRole | null; minPairs?: number; sort?: SortMetric; limit?: number } = {},
): Neighborhood {
  const { role = null, minPairs = graph.contract.minPairSupport, sort = "npmi", limit = 40 } = opts;

  const focusIndex = graph.nodes.indexOf(focus);
  const edges = role ? role.edges : graph.edges;
  const denominator = role ? role.positions : graph.provenance.nPositions;

  // Focus support inside a role is not carried directly; recover it from any
  // edge touching the focus, where pairs / P(focus-side) is exactly that count.
  const focusSupport = role ? roleFocusSupport(role, focusIndex) : focus.support;

  const matched: Neighbor[] = [];
  for (const edge of edges) {
    if (edge.a !== focusIndex && edge.b !== focusIndex) continue;
    if (edge.pairs < minPairs) continue;
    const isA = edge.a === focusIndex;
    const other = graph.nodes[isA ? edge.b : edge.a];
    if (!other) continue;
    matched.push({
      node: other,
      pairs: edge.pairs,
      pGiven: isA ? edge.pBgivenA : edge.pAgivenB,
      pReverse: isA ? edge.pAgivenB : edge.pBgivenA,
      lift: edge.lift,
      npmi: edge.npmi,
    });
  }

  matched.sort(COMPARATORS[sort]);

  return {
    focus,
    focusSupport,
    neighbors: matched.slice(0, limit),
    denominator,
    scopeLabel: role ? role.name : "all roles",
    truncated: matched.length > limit,
  };
}

function roleFocusSupport(role: MetalabRole, focusIndex: number): number {
  for (const edge of role.edges) {
    if (edge.a === focusIndex) return Math.round(edge.pairs / edge.pBgivenA);
    if (edge.b === focusIndex) return Math.round(edge.pairs / edge.pAgivenB);
  }
  return 0;
}
