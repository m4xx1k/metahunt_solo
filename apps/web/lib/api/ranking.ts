import type { VacancyDto } from "./vacancies";

// reverse-ATS matcher client — mirrors apps/etl .../ranking/ranking.contract.ts.
// A ranked card = the full feed VacancyDto + a personalized match overlay.

export interface SkillRef {
  id: string;
  name: string;
  weight: number;
}

export const FIT_TIER_VALUES = ["STRONG", "GOOD", "STRETCH"] as const;
export type FitTier = (typeof FIT_TIER_VALUES)[number];

// Page order. "score" (default) is Fit order; "date" is the cold feed's
// freshness order with the score still on every card.
export const MATCH_SORT_VALUES = ["score", "date"] as const;
export type MatchSort = (typeof MATCH_SORT_VALUES)[number];

// What the Fit % is made of. One signal today (skill-overlap); the tooltip
// renders the array, so a future signal needs no UI change.
export type ScoreSignalKind = "skill-overlap";

export interface ScoreSignal {
  kind: ScoreSignalKind;
  raw: number;
  weight: number;
  contribution: number;
}

export interface ScoreBreakdown {
  total: number; // 0..1 — `fit.percent` is its display form
  signals: ScoreSignal[];
}

export interface RankedVacancy {
  vacancy: VacancyDto;
  relevance: number;
  onStack: boolean; // false = off-stack, ranked below in-stack matches
  fit: { tier: FitTier; percent: number; matchedRequired: number; requiredTotal: number };
  breakdown: ScoreBreakdown;
  diff: { have: SkillRef[]; missing: SkillRef[]; bonus: SkillRef[] };
}

export interface MatchResponse {
  resolved: { matched: SkillRef[]; unmatched: string[] };
  items: RankedVacancy[];
  page: number;
  pageSize: number;
  total: number;
  /** Off-stack rows the filter removed — drives the "show them" toggle. */
  offStackHidden: number;
}

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
