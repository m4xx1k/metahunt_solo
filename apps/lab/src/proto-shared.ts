// Shared loader for the three T5 interaction prototypes. Throwaway — deleted
// once a direction is chosen. Not wired into the prod build.

import Graphology from "graphology";
import louvain from "graphology-communities-louvain";

export type PNode = {
  idx: number;
  id: string;
  name: string;
  support: number;
  deg: number;
  top: number[];
  community: number;
};

export type PEdge = {
  a: number;
  b: number;
  pairs: number;
  pBgivenA: number;
  pAgivenB: number;
  npmi: number;
};

const asset = (n: string) => `${import.meta.env.BASE_URL}data/${n}`;

export async function loadProto(minNpmi = 0.3) {
  const [core, edgeFile] = await Promise.all([
    fetch(asset("core.json")).then((r) => r.json()),
    fetch(asset("edges.json")).then((r) => r.json()),
  ]);

  const edges: PEdge[] = (edgeFile.edges as number[][]).map((e) => ({
    a: e[0],
    b: e[1],
    pairs: e[2],
    pBgivenA: e[3],
    pAgivenB: e[4],
    npmi: e[6],
  }));

  // Louvain over the links above the floor — same recipe as the real Map.
  const g = new Graphology({ type: "undirected" });
  for (const e of edges) {
    if (e.npmi < minNpmi) continue;
    for (const n of [e.a, e.b]) if (!g.hasNode(n)) g.addNode(n);
    g.addEdge(e.a, e.b, { weight: e.npmi });
  }
  const community = new Map<number, number>();
  if (g.order > 0) {
    louvain.assign(g, { getEdgeWeight: "weight" });
    g.forEachNode((n, a) => community.set(Number(n), a.community as number));
  }

  const nodes: PNode[] = (core.nodes as Omit<PNode, "idx" | "community">[]).map((n, i) => ({
    ...n,
    idx: i,
    community: community.get(i) ?? -1,
  }));

  // adjacency over ALL edges, for neighbourhood lookups
  const adj = new Map<number, PEdge[]>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e);
  }

  return { nodes, edges, adj, community };
}

/** A low-chroma golden-angle hue per community — same idea as the real map. */
export function clusterHue(c: number, dark: boolean) {
  if (c < 0) return dark ? "#6b746f" : "#8d9691";
  return `hsl(${((c + 1) * 137.508) % 360} 52% ${dark ? 62 : 48}%)`;
}

export const isDark = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
