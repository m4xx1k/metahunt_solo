/** Shapes the app works with. The wire format lives in `data.ts` — the pipeline
 *  ships three files (core/edges/roles) and `loadGraph` reassembles this `Graph`,
 *  so views stay a pure function of it. A change here should be a deliberate
 *  edit, not a codegen diff nobody reads. */

export type SkillNode = {
  id: string;
  name: string;
  support: number;
  prevalence: number;
  /** Global degree over every edge in edges.json. Preview aid for the map. */
  deg: number;
  /** Up to 8 companion node indices, P(companion | this) desc — a cheap
   *  neighbourhood before edges.json lands. Depth/sort owned by T4. */
  top: number[];
};

/** Endpoints are indices into `nodes`, not UUIDs — two 36-char ids per edge
 *  dominated the artifact size. */
export type Edge = {
  a: number;
  b: number;
  pairs: number;
  pBgivenA: number;
  pAgivenB: number;
  lift: number;
  npmi: number;
};

/** In-role edges carry no NPMI: within a segment the marginals shift, and the
 *  honest comparison against the global number is lift, not a rescaled NPMI. */
export type RoleEdge = Omit<Edge, "npmi">;

export type Role = {
  id: string;
  name: string;
  positions: number;
  skills: { n: number; support: number; share: number }[];
  edges: RoleEdge[];
};

export type Contract = {
  grain: string;
  positionSkillRule: string;
  skillEligibility: string;
  requirementLayer: string;
  livenessClaim: string;
  minSkillSupport: number;
  minPairSupport: number;
  minRolePositions: number;
};

export type Provenance = {
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

export type Graph = {
  contract: Contract;
  provenance: Provenance;
  sensitivity: Record<string, number>;
  sources: { code: string; positions: number }[];
  nodes: SkillNode[];
  edges: Edge[];
  roles: Role[];
};

export type Relation = "SUBSTITUTE" | "COMPLEMENT" | "IMPLIES" | "CONTESTED";

/** The hand-curated relation layer, as the views consume it. On disk it is
 *  src/data/pair-relations.json (name-keyed, hand-edited — guardrail 4); the
 *  pipeline resolves those names to node indices against the rebuild and ships
 *  the result in core.json, and `loadGraph` rebuilds this shape from it. */
export type PairRelations = {
  labelledAt: string;
  method: string;
  pairs: { pair: [string, string]; relation: Relation; note?: string }[];
};

// --- wire format: pipeline/assemble.mjs output --------------------------------

/** [a, b, pairs, pBgivenA, pAgivenB, lift, npmi, rel] — rel indexes
 *  `CoreFile.relations`, or -1 when the pair has no curated label. */
export type EdgeTuple = [number, number, number, number, number, number, number, number];

/** A curated label already resolved to this rebuild's node indices. `a`/`b`
 *  stay in curated order: IMPLIES reads a → b. */
export type RelationLabel = {
  a: number;
  b: number;
  names: [string, string];
  rel: number;
  note?: string;
};

export type CoreFile = {
  contract: Contract;
  provenance: Provenance;
  sensitivity: Record<string, number>;
  sources: { code: string; positions: number }[];
  relations: Relation[];
  relationMeta: { method: string; labelledAt: string; count: number };
  relationLabels: RelationLabel[];
  nodes: SkillNode[];
};

export type EdgesFile = { edges: EdgeTuple[]; adj: Record<string, number[]> };

export type RolesFile = { roles: Role[] };

/** A labelled pair joined against the edge it describes. `edge` is absent when
 *  the pair no longer clears the support floor — the label outlives the edge. */
export type LabelledPair = {
  pair: [string, string];
  relation: Relation;
  note?: string;
  edge?: Edge;
};

/** A neighbour of a selected skill, resolved for display. */
export type Neighbour = {
  node: SkillNode;
  index: number;
  pairs: number;
  /** P(neighbour | selected) — always oriented away from the selected skill. */
  p: number;
  lift: number;
  npmi: number;
};
