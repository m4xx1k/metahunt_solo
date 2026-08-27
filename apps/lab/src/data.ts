import type { CoreFile, Edge, EdgesFile, Graph, PairRelations, RolesFile } from "./types";

/** The pipeline ships three static files (pipeline/assemble.mjs):
 *
 *   core.json   nodes + contract/provenance + resolved relation labels
 *   edges.json  edge tuples + a node→edge adjacency index
 *   roles.json  role marginals and in-role pair counts
 *
 * They are fetched, never imported: an `import x from "./data/*.json"` inlines
 * the file into the JS bundle (guardrail 5 in the constellation migration).
 * `loadGraph` reassembles them into the single `Graph` the views already take,
 * so nothing downstream needs to know the payload is split. */

const asset = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;

async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(asset(name));
  if (!res.ok) throw new Error(`lab: ${name} → ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function loadGraph(): Promise<{ graph: Graph; curated: PairRelations }> {
  const [core, edgeFile, roleFile] = await Promise.all([
    getJSON<CoreFile>("core.json"),
    getJSON<EdgesFile>("edges.json"),
    getJSON<RolesFile>("roles.json"),
  ]);

  const edges: Edge[] = edgeFile.edges.map(([a, b, pairs, pBgivenA, pAgivenB, lift, npmi]) => ({
    a,
    b,
    pairs,
    pBgivenA,
    pAgivenB,
    lift,
    npmi,
  }));

  const graph: Graph = {
    contract: core.contract,
    provenance: core.provenance,
    sensitivity: core.sensitivity,
    sources: core.sources,
    nodes: core.nodes,
    edges,
    roles: roleFile.roles,
  };

  // Rebuild the name-keyed shape the views read. The pipeline already checked
  // every label resolves against these nodes, so this cannot orphan.
  const curated: PairRelations = {
    labelledAt: core.relationMeta.labelledAt,
    method: core.relationMeta.method,
    pairs: core.relationLabels.map((l) => ({
      pair: l.names,
      relation: core.relations[l.rel],
      ...(l.note ? { note: l.note } : {}),
    })),
  };

  return { graph, curated };
}
