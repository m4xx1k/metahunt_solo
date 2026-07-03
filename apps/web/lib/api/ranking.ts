import { apiPost } from "./client";
import type {
  EmploymentType,
  EnglishLevel,
  Seniority,
  VacancyDto,
  WorkFormat,
} from "./vacancies";

// reverse-ATS matcher client — mirrors apps/etl .../ranking/ranking.contract.ts.
// A ranked card = the full feed VacancyDto + a personalized match overlay.

export interface SkillRef {
  id: string;
  name: string;
  weight: number;
}

export const FIT_TIER_VALUES = ["STRONG", "GOOD", "STRETCH"] as const;
export type FitTier = (typeof FIT_TIER_VALUES)[number];

export interface RankedVacancy {
  vacancy: VacancyDto;
  relevance: number;
  onStack: boolean; // false = off-stack, ranked below in-stack matches
  fit: { tier: FitTier; matchedRequired: number; requiredTotal: number };
  diff: { have: SkillRef[]; missing: SkillRef[]; bonus: SkillRef[] };
}

export interface MatchResponse {
  resolved: { matched: SkillRef[]; unmatched: string[] };
  items: RankedVacancy[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MatchBody {
  skills: string[];
  seniorities?: Seniority[]; // OR — middle ∪ senior etc.
  workFormats?: WorkFormat[]; // OR — REMOTE ∪ HYBRID
  englishLevels?: EnglishLevel[];
  employmentTypes?: EmploymentType[];
  domainIds?: string[]; // OR — DOMAIN node slugs (resolved -> ids server-side)
  experienceYears?: string[]; // discrete tokens "0".."5" + "6+"
  hasTestAssignment?: boolean; // false keeps unknowns; true strict
  hasReservation?: boolean;
  minFitTier?: FitTier; // hide below this coverage tier
  postedWithinDays?: number; // freshness
  page?: number;
  pageSize?: number;
}

export const rankingApi = {
  match: (body: MatchBody) => apiPost<MatchResponse>("/ranking/match", body),
};

// "What to learn next" — mirrors ranking.contract RecommendItem/RecommendResponse.
export interface RecommendItem {
  nodeId: string;
  name: string;
  unlocks: number; // cohort vacancies crossing into >= GOOD if this skill is learned
  toStrong: number; // subset crossing into STRONG
  idf: number;
  leverage: boolean; // rarer-than-average among the recommendations
}

export interface RecommendResponse {
  cohortSize: number;
  coveragePct: number;
  reducedState: boolean; // cohort too small for a stable list — gauge only
  items: RecommendItem[];
  redundant: string[];
}
