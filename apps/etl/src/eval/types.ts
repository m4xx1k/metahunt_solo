import type { ExtractedVacancy } from "../baml_client";

export const FIELDS = [
  "isTech",
  "role",
  "seniority",
  "skills",
  "experienceYears",
  "salary",
  "englishLevel",
  "employmentType",
  "workFormat",
  "locations",
  "domain",
  "engagementType",
  "companyName",
  "hasTestAssignment",
  "hasReservation",
] as const satisfies readonly (keyof ExtractedVacancy)[];

export type Field = (typeof FIELDS)[number];

export const NOT_SCORABLE_REASONS = [
  "schema-limitation",
  "policy-pending",
  "taxonomy-gap",
  "source-ambiguous",
] as const;

export type NotScorableReason = (typeof NOT_SCORABLE_REASONS)[number];

/** An exclusion says the source fact is real but the current contract cannot score it fairly. */
export type FieldExclusion = { reason: NotScorableReason; evidence: string };
export type FieldExclusions = Partial<Record<Field, FieldExclusion>>;

export type ReviewDisposition = "adopted-arbiter" | "superseded-arbiter" | "manual-ruling";
export type ReviewRationale = { disposition: ReviewDisposition; evidence: string };
export type ReviewRationales = Partial<Record<Field, ReviewRationale>>;

// Scored as their own number so a role regression is not averaged away by noise in
// a field like `hasTestAssignment`.
export const CORE_FIELDS: readonly Field[] = ["isTech", "role", "skills", "seniority", "salary"];

// Sidecar keys `RssExtractActivity` merges alongside the extraction. `Partial` because
// rows predating a field (isTech) or a failed run carry only some of them.
export type Extraction = Partial<ExtractedVacancy> & {
  _v?: number;
  _usage?: Record<string, unknown>;
  _error?: string;
};

export type ManifestEntry = {
  id: string;
  source: string;
  category: string;
  title: string;
  link: string | null;
  publishedAt: string;
  cells: string[];
};

export type CoverageCell = { cell: string; picked: number; pool: number; cap: number };

export type Decision = {
  approved: boolean;
  overrides: Record<string, unknown>;
  /** Why a human chose a value other than the merged candidate. Required for a release. */
  rationales?: ReviewRationales;
  /** Fields deliberately excluded from the score; null is never an exclusion. */
  exclusions?: FieldExclusions;
  /** Snapshot of what was approved, so a later `merge` cannot rewrite a signed-off row. */
  values: Extraction;
  reviewedAt: string;
};

export type DecisionsFile = { generatedAt: string; decisions: Record<string, Decision> };

export type GoldenRow = {
  id: string;
  title: string;
  link: string | null;
  source: string;
  values: Extraction;
  exclusions?: FieldExclusions;
  approvedAt: string;
};

export type DatasetFile = { generatedAt: string; rows: GoldenRow[] };

export type CandidatesFile = { generatedAt: string; candidates: LabelCandidate[] };

export type LabelFile = {
  batch: number;
  labeller: string;
  labels: { id: string; values: Extraction; notes?: Record<string, string> }[];
};

export type FieldVerdict = "agreed" | "prod-differs" | "contested";

export type CandidateField = {
  value: unknown;
  verdict: FieldVerdict;
  a: unknown;
  b: unknown;
  prod: unknown;
  arbiter?: unknown;
};

export type LabelCandidate = {
  id: string;
  title: string;
  link: string | null;
  source: string;
  fields: Record<string, CandidateField>;
};

export type Manifest = {
  generatedAt: string;
  size: number;
  poolSize: number;
  coverage: CoverageCell[];
  entries: ManifestEntry[];
};

export type EvaluationSnapshot = {
  generatedAt: string;
  corpusSha256: string;
  prompt: { version: number; sourceSha256: string };
  taxonomy: { roles: string; domains: string; skills: string };
  aliases: Record<string, string>;
};

/** Immutable sidecar for one extraction run. Never infer these facts from its output. */
export type RunProvenance = {
  run: string;
  createdAt: string;
  runner: "agent" | "baml";
  provider: string;
  model: string;
  pipelineCommit: string;
  snapshot: {
    corpusSha256: string;
    promptVersion: number;
    promptSourceSha256: string;
    taxonomySha256: string;
    aliasesSha256: string;
  };
};

/** Immutable copy of one reviewed dataset, made before the working directory changes. */
export type GoldenArchive = {
  id: string;
  policyVersion: string;
  createdAt: string;
  rows: number;
  files: Record<string, { sha256: string; bytes: number }>;
};
