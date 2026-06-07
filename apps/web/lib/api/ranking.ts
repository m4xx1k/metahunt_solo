import { apiPost } from "./client";
import type { Seniority, VacancyDto, WorkFormat } from "./vacancies";

// reverse-ATS matcher client — mirrors apps/etl .../ranking/ranking.contract.ts.
// A ranked card = the full feed VacancyDto + a personalized match overlay.

export interface SkillRef {
  id: string;
  name: string;
  weight: number;
}

export type FitTier = "STRONG" | "GOOD" | "STRETCH";

export interface RankedVacancy {
  vacancy: VacancyDto;
  relevance: number;
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
  workFormat?: WorkFormat; // e.g. REMOTE
  postedWithinDays?: number; // freshness
  page?: number;
  pageSize?: number;
}

export const rankingApi = {
  match: (body: MatchBody) => apiPost<MatchResponse>("/ranking/match", body),
};
