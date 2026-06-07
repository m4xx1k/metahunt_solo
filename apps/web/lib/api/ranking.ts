import { apiPost } from "./client";
import type { Seniority } from "./vacancies";

// reverse-ATS matcher client — mirrors apps/etl .../ranking/ranking.contract.ts.

export interface SkillRef {
  id: string;
  name: string;
  weight: number;
}

export type FitTier = "STRONG" | "GOOD" | "STRETCH";

export interface RankedVacancy {
  id: string;
  title: string;
  company: string | null;
  seniority: Seniority | null;
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
  seniority?: Seniority;
  pageSize?: number;
}

export const rankingApi = {
  match: (body: MatchBody) => apiPost<MatchResponse>("/ranking/match", body),
};
