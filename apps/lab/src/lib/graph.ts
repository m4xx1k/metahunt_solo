import type { Edge, Graph, Neighbour, Role, RoleEdge, SkillNode } from "../types";

export const fmt = (n: number) => n.toLocaleString("en-US");
export const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** Index every edge by both endpoints once, so a neighbourhood lookup is O(deg)
 *  instead of a scan over 4k edges on every keystroke. */
export function buildAdjacency(edges: readonly Edge[]): Map<number, Edge[]> {
  const adj = new Map<number, Edge[]>();
  const push = (k: number, e: Edge) => {
    const list = adj.get(k);
    if (list) list.push(e);
    else adj.set(k, [e]);
  };
  for (const e of edges) {
    push(e.a, e);
    push(e.b, e);
  }
  return adj;
}

/** Orient an edge away from the selected skill: `p` always reads
 *  P(neighbour | selected), never the other direction. */
export function neighboursOf(
  graph: Graph,
  adj: Map<number, Edge[]>,
  index: number,
  minPairs: number,
): Neighbour[] {
  const out: Neighbour[] = [];
  for (const e of adj.get(index) ?? []) {
    if (e.pairs < minPairs) continue;
    const other = e.a === index ? e.b : e.a;
    out.push({
      node: graph.nodes[other],
      index: other,
      pairs: e.pairs,
      p: e.a === index ? e.pBgivenA : e.pAgivenB,
      lift: e.lift,
      npmi: e.npmi,
    });
  }
  return out;
}

/** The same pair measured inside a role. Absence is meaningful: it means the
 *  pair did not clear min support within that segment, not that it is zero. */
export function inRoleEdge(role: Role, a: number, b: number): RoleEdge | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return role.edges.find((e) => Math.min(e.a, e.b) === lo && Math.max(e.a, e.b) === hi);
}

export function searchSkills(nodes: readonly SkillNode[], query: string, limit = 40): SkillNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes.slice(0, limit);
  const starts: SkillNode[] = [];
  const contains: SkillNode[] = [];
  for (const n of nodes) {
    const name = n.name.toLowerCase();
    if (name.startsWith(q)) starts.push(n);
    else if (name.includes(q)) contains.push(n);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** NPMI bands used consistently across views. Kept as one function so the UI
 *  cannot disagree with itself about what counts as a strong link. */
export function npmiClass(npmi: number): "strong" | "weak" | "" {
  if (npmi >= 0.3) return "strong";
  if (npmi < 0.12) return "weak";
  return "";
}
