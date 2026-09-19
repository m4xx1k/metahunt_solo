import type { ExtractionResult, ExtractionUsage } from "../02-enrich/extraction/vacancy-extractor";

export type RequirementPriority = "must" | "nice";

/** One requirement is one choice: an ordinary requirement is `anyOf` with one entry. */
export type Requirement = { priority: RequirementPriority; anyOf: string[] };

export type RequirementDatasetInput = {
  id: string;
  title: string;
  text: string;
};

export type RequirementExpectedOutput = {
  isTech: boolean;
  role: string | null;
  seniority: string | null;
  requirements: Requirement[];
};

export type RequirementDatasetMetadata = {
  reviewStatus: "draft" | "approved" | "rejected";
  slices: string[];
  contractVersion: "requirements-v2";
};

export type RequirementDatasetCase = {
  input: RequirementDatasetInput;
  expectedOutput: RequirementExpectedOutput;
  metadata: RequirementDatasetMetadata;
};

export type LegacySkills = {
  required?: string[] | null;
  optional?: string[] | null;
};

export type ExtractedVacancyForEval = {
  isTech: boolean;
  role: string | null;
  seniority: string | null;
  skills?: LegacySkills | null;
  requirements?: Requirement[] | null;
};

export type ScorerAliasMap = ReadonlyMap<string, string>;

export type RequirementScore = {
  schemaValid: boolean;
  providerFailure: boolean;
  requirementsPrecision: number;
  requirementsRecall: number;
  requirementsF1: number;
  priorityAccuracy: number;
  alternativeAccuracy: number;
  orSplitErrors: number;
  guardAccuracy: { isTech: number; role: number; seniority: number };
  expectedClauses: string[];
  actualClauses: string[];
  error?: string;
};

export type RequirementsSummary = {
  evaluatedCases: number;
  schemaValidRate: number;
  providerFailureRate: number;
  requirementsPrecision: number;
  requirementsRecall: number;
  requirementsF1: number;
  priorityAccuracy: number;
  alternativeAccuracy: number;
  orSplitErrors: number;
  guardAccuracy: { isTech: number; role: number; seniority: number };
};

/** Everything an extractor must do for the eval; `identity()` is the production cache's concern. */
export type EvalExtractor = { extract(text: string): Promise<ExtractionResult> };

export type RowResult = {
  id: string;
  title: string;
  reviewStatus: RequirementDatasetMetadata["reviewStatus"];
  score: RequirementScore;
  actual: ExtractedVacancyForEval | null;
  usage: ExtractionUsage;
  error?: string;
};

export type EvalRun = {
  startedAt: string;
  durationMs: number;
  extractor: string;
  client: string;
  model: string;
  aliasSnapshotSha: string;
  gated: boolean;
  /** Mean over `passes`; a single pass carries a few points of model noise. */
  summary: RequirementsSummary;
  passes: RequirementsSummary[];
  /** The last pass only — the per-row view is for reading disagreements. */
  rows: RowResult[];
};
