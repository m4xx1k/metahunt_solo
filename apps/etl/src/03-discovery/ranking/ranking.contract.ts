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
  onStack: boolean; // vacancy's required core tech is in the candidate's stack-set (ADR-0010 / v2 demote)
  fit: FitInfo;
  diff: SkillDiff;
}

export interface MatchFilters {
  seniorities?: Seniority[]; // OR — keep vacancies at ANY listed level (e.g. middle ∪ senior)
  workFormats?: WorkFormat[]; // OR — REMOTE ∪ HYBRID …
  englishLevels?: EnglishLevel[]; // OR — the level the job requires
  employmentTypes?: EmploymentType[]; // OR — full-time ∪ contract …
  domainIds?: string[]; // OR — keep vacancies in ANY listed DOMAIN node (like the feed)
  roleNodeIds?: string[]; // OR — hard filter: the user's explicit role choice, not a soft demote
  experienceYears?: string[]; // discrete tokens "0".."5" (exact) + "6+" (≥6); NULL passes
  hasTestAssignment?: boolean; // false also keeps unknowns (no confirmed test); true is strict
  hasReservation?: boolean; // UA military deferment ("бронь")
  minFitTier?: FitTier; // hide vacancies below this coverage tier (STRONG > GOOD > STRETCH)
  sourceId?: string;
  postedWithinDays?: number; // freshness — coalesce(published_at, loaded_at) within N days
  loadedAfter?: Date; // digest only: new-since floor
  excludeIds?: string[]; // digest only: already-sent anti-join
}

export interface MatchResponse {
  resolved: ResolveResult;
  items: RankedVacancy[];
  page: number;
  pageSize: number;
  total: number;
}

// Fit-coverage thresholds. v1 expert guesses (no ground truth yet) — the SINGLE
// source of truth for the ranked SQL's tier_bucket (ranking.service: drives the
// sort, the minFitTier filter, AND the displayed badge) and for fitTierWeighted
// below, the spec-tested reference the SQL CASE must mirror. Calibrate here,
// once. NOTE: coverage is IDF-WEIGHTED — re-eyeball these two on real data.
export const FIT_STRONG_MIN = 0.8;
export const FIT_GOOD_MIN = 0.5;

// Fit tier from IDF-WEIGHTED required coverage (Σ IDF(matched req) / Σ IDF(all
// req)) — so matching trivial low-IDF required skills can no longer inflate the
// tier. When the vacancy tags NO required skills, fall back to weighted coverage
// over ALL listed skills (matchedAllW / allW) — never a free GOOD pass. den<=0
// (nothing to assess) → STRETCH, not a fake %. The SQL tier_bucket CASE in
// rankByRefs computes the live tier; this is the reference it must mirror.
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

// Role suggester ("which roles fit my skills"): a role's score is the smoothed
// share of its last-30d vacancies the candidate covers at GOOD+. All three are
// v1 expert guesses next to FIT_*_MIN above — calibrate here, once.
export const ROLE_SUGGEST_WINDOW_DAYS = 30;
export const ROLE_SUGGEST_MIN_VACANCIES = 10; // below this the estimate is unstable (and digests would run empty)
export const ROLE_SUGGEST_MIN_SCORE = 0.05; // raw GOOD+ share below this = "not yours" (see role-suggestions.derive)
export const ROLE_SUGGEST_TOP_N = 5;

export interface RoleSuggestion {
  roleId: string;
  slug: string | null;
  name: string;
  score: number;
  goodCount: number; // numerator shown in the UI ("N of M vacancies fit")
  totalCount: number;
}

export interface RoleSuggestionsResponse {
  reduced: boolean; // no role reached MIN_SCORE at GOOD+ — items ranked by avg coverage instead
  items: RoleSuggestion[];
}

// "What to learn next" recommendations — see ADR-0009. A marginal counterfactual
// over the candidate's role cohort: a missing required skill that crosses a
// near-miss vacancy into >= GOOD coverage "unlocks" it.
export const REC_TOP_N = 8;
export const REC_DF_FLOOR = 5; // a skill must be required in >= this many cohort vacancies
export const REC_GENERIC_DF_SHARE = 0.6; // drop "everyone has it" skills above this cohort share
export const REC_MIN_COHORT = 20; // below this the cohort is too small for a stable list

// Co-occurrence floor for the framework substitute-gate (ADR-0010): two
// same-stack core frameworks below this npmi are substitutes (React/Angular
// ~0.22 — drop the not-held one) vs complements above it (Selenium/Appium
// ~0.36 — keep). Tuned on vacancy-tag co-occurrence; see skill-weighting-research §3.E.
export const SUBSTITUTE_NPMI_MIN = 0.3;

export interface RecommendItem {
  nodeId: string;
  name: string;
  unlocks: number; // cohort vacancies crossing into >= GOOD when this skill is added
  toStrong: number; // subset crossing into STRONG
  idf: number; // IDF weight from node_stats
  leverage: boolean; // rarer-than-average among the recommendations
}

export interface RecommendResponse {
  cohortSize: number;
  coveragePct: number; // % of cohort already in GOOD+STRONG
  reducedState: boolean; // cohort too small for a stable list — show the gauge only
  items: RecommendItem[];
  redundant: string[]; // candidate skills generic in this cohort ("barely move the needle")
}

// Skill metadata for the recommendation stack-gates — see ADR-0010 and
// md/journal/migrations/skill-metadata-recommendations.md. Populated in
// `node_tech_meta` by the classify-skills backfill (BAML ClassifySkills).
//
// TECH_CATEGORIES mirrors the `skill_category` pgEnum (DB-enforced). TECH_STACKS
// is the `stack` validation set — `stack` is a plain text column, so extending
// this array later needs NO DB migration (the gates just gain a new stack value).
export const TECH_CATEGORIES = [
  "LANGUAGE",
  "FRAMEWORK",
  "LIBRARY",
  "DATASTORE",
  "CLOUD",
  "TOOL",
  "PRACTICE",
  "SOFT",
] as const;
export const TECH_STACKS = [
  "node",
  "python",
  "java",
  "dotnet",
  "go",
  "php",
  "ruby",
  "cpp",
  "rust",
  "frontend",
  "mobile-ios",
  "mobile-android",
  "mobile-cross",
  "qa",
  "data",
  "devops",
  "blockchain",
  "game",
] as const;
export type SkillCategory = (typeof TECH_CATEGORIES)[number];
export interface NodeTechMeta {
  nodeId: string;
  category: SkillCategory;
  stack: string | null;
  isCore: boolean;
  generic: boolean;
}
