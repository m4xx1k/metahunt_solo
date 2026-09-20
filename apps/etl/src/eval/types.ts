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
  profile?: ProfileExpectation;
};

/**
 * Production's non-requirement fields. A key that is present has been reviewed —
 * `null` then means the posting genuinely does not state it. A key that is absent
 * has not been reviewed and is skipped, so partial labelling cannot invent a fact.
 */
export type ProfileExpectation = {
  workFormat?: "REMOTE" | "OFFICE" | "HYBRID" | null;
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE" | "INTERNSHIP" | null;
  englishLevel?: "BEGINNER" | "INTERMEDIATE" | "UPPER_INTERMEDIATE" | "ADVANCED" | "NATIVE" | null;
  engagementType?: "PRODUCT" | "OUTSOURCE" | "OUTSTAFF" | "STARTUP" | "AGENCY" | null;
  experienceYears?: number | null;
  hasTestAssignment?: boolean | null;
  companyName?: string | null;
};

export const PROFILE_FIELDS = [
  "workFormat",
  "employmentType",
  "englishLevel",
  "engagementType",
  "experienceYears",
  "hasTestAssignment",
  "companyName",
] as const satisfies ReadonlyArray<keyof ProfileExpectation>;

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
  alternatives?: Array<{ anyOf?: string[] | null }> | null;
};

export type ExtractedVacancyForEval = {
  isTech: boolean;
  role: string | null;
  seniority: string | null;
  skills?: LegacySkills | null;
  requirements?: Requirement[] | null;
} & Partial<Record<keyof ProfileExpectation, unknown>>;

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
  /** Only fields labelled here AND produced by the extractor; see ProfileExpectation. */
  profile: { checked: number; correct: number; wrong: ProfileMiss[] };
  expectedClauses: string[];
  actualClauses: string[];
  error?: string;
};

export type ProfileMiss = { field: string; expected: unknown; actual: unknown };

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
  profileChecked: number;
  profileAccuracy: number;
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
