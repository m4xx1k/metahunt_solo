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
// source of truth, read by both `fitTierWeighted` (the badge) AND the ranked
// SQL's tier-bucket sort (ranking.service): if these drift apart the displayed
// tier stops matching the sort order. Calibrate here, once. NOTE: coverage is
// now IDF-WEIGHTED, so the distribution is more bimodal than the old unweighted
// count — re-eyeball these two constants on real data.
export const FIT_STRONG_MIN = 0.8;
export const FIT_GOOD_MIN = 0.5;

// Fit tier from IDF-WEIGHTED required coverage (Σ IDF(matched req) / Σ IDF(all
// req)) — so matching trivial low-IDF required skills can no longer inflate the
// tier. When the vacancy tags NO required skills, fall back to weighted coverage
// over ALL listed skills (matchedAllW / allW) — never a free GOOD pass. den<=0
// (nothing to assess) → STRETCH, not a fake %. Mirrors the SQL CASE in
// rankByRefs; keep the two in lockstep.
export function fitTierWeighted(
  matchedReqW: number,
  reqW: number,
  matchedAllW: number,
  allW: number,
): FitTier {
  const [num, den] = reqW > 0 ? [matchedReqW, reqW] : [matchedAllW, allW];
  if (den <= 0) return "STRETCH";
  const coverage = num / den;
  if (coverage >= FIT_STRONG_MIN) return "STRONG";
  if (coverage >= FIT_GOOD_MIN) return "GOOD";
  return "STRETCH";
}
