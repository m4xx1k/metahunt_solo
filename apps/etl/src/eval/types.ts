import type { ExtractionResult, ExtractionUsage } from "../02-enrich/extraction/vacancy-extractor";

export type RequirementPriority = "must" | "nice";

/** The candidate contract. `value` is a single alternative; `anyOf` is an explicit OR. */
export type Requirement =
  | { priority: RequirementPriority; value: string }
  | { priority: RequirementPriority; anyOf: string[] };

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

export type ExtractorName = "requirements-v2" | "production";

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
  extractor: ExtractorName;
  client: string;
  model: string;
  aliasSnapshotSha: string;
  gated: boolean;
  summary: RequirementsSummary;
  rows: RowResult[];
};
