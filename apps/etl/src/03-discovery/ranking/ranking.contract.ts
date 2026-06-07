import type {
  EmploymentType,
  EnglishLevel,
  Seniority,
  WorkFormat,
} from "../../platform/shared/contract";
import type { VacancyDto } from "../feed/feed.contract";

// reverse-ATS matcher contract — see md/journal/migrations/reverse-ats.md (§2).
// A ranked card = the full feed VacancyDto + a personalized match overlay:
// Fit (coverage tier) + Relevance (Σ IDF weight, the sort key) + skill diff.

export const FIT_TIER_VALUES = ["STRONG", "GOOD", "STRETCH"] as const;
export type FitTier = (typeof FIT_TIER_VALUES)[number];

export interface SkillRef {
  id: string;
  name: string;
  weight: number; // IDF weight from node_stats (0 if the skill is on no vacancy)
}

export interface ResolveResult {
  matched: SkillRef[]; // distinct SKILL nodes the input mapped to
  unmatched: string[]; // input skills with no SKILL node (taxonomy/extraction gap)
}

export interface FitInfo {
  tier: FitTier;
  matchedRequired: number;
  requiredTotal: number;
}

export interface SkillDiff {
  have: SkillRef[]; // ✅ candidate skills the job wants (weight desc)
  missing: SkillRef[]; // ❌ required skills the candidate lacks (weight desc)
  bonus: SkillRef[]; // ➕ candidate skills the job doesn't ask for (weight desc)
}

export interface RankedVacancy {
  vacancy: VacancyDto;
  relevance: number; // Σ weight over overlap — the sort key
  fit: FitInfo;
  diff: SkillDiff;
}

export interface MatchFilters {
  seniorities?: Seniority[]; // OR — keep vacancies at ANY listed level (e.g. middle ∪ senior)
  workFormats?: WorkFormat[]; // OR — REMOTE ∪ HYBRID …
  englishLevels?: EnglishLevel[]; // OR — the level the job requires
  employmentTypes?: EmploymentType[]; // OR — full-time ∪ contract …
  hasTestAssignment?: boolean; // false also keeps unknowns (no confirmed test); true is strict
  hasReservation?: boolean; // UA military deferment ("бронь")
  minFitTier?: FitTier; // hide vacancies below this coverage tier (STRONG > GOOD > STRETCH)
  sourceId?: string;
  postedWithinDays?: number; // freshness — coalesce(published_at, loaded_at) within N days
}

export interface MatchResponse {
  resolved: ResolveResult;
  items: RankedVacancy[];
  page: number;
  pageSize: number;
  total: number;
}

// Fit-coverage thresholds. v1 expert guesses (no ground truth yet) — the SINGLE
// source of truth, read by both `fitTier` (the badge) AND the ranked SQL's
// tier-bucket sort (ranking.service): if these drift apart the displayed tier
// stops matching the sort order. Calibrate here, once.
export const FIT_STRONG_MIN = 0.8;
export const FIT_GOOD_MIN = 0.5;

// Fit coverage → tier. |required| = 0 is neutral → GOOD (tracker: never emit a
// fake %).
export function fitTier(matchedRequired: number, requiredTotal: number): FitTier {
  if (requiredTotal === 0) return "GOOD";
  const coverage = matchedRequired / requiredTotal;
  if (coverage >= FIT_STRONG_MIN) return "STRONG";
  if (coverage >= FIT_GOOD_MIN) return "GOOD";
  return "STRETCH";
}
