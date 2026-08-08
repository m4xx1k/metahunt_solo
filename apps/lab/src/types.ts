/** Shape of pipeline/04-export.sql output. Kept hand-written: the artifact is a
 *  reviewed contract, so a change here should be a deliberate edit, not a codegen
 *  diff nobody reads. */

export type SkillNode = {
  id: string;
  name: string;
  slug: string;
  support: number;
  prevalence: number;
  category: string | null;
  stack: string | null;
  isCore: boolean | null;
  generic: boolean | null;
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

/** Shape of src/data/pair-relations.json — the hand-curated layer. Keyed by
 *  canonical skill name, not node index: indices move on every lab:data run. */
export type PairRelations = {
  version: number;
  labelledAt: string;
  method: string;
  pairs: { pair: [string, string]; relation: Relation; note?: string }[];
};

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
