import type { Seniority, WorkFormat } from "../../platform/shared/contract";

// reverse-ATS matcher contract — see md/journal/migrations/reverse-ats.md (§2).
// Two axes per card: Fit (coverage tier) + Relevance (Σ IDF weight, the sort key).

export type FitTier = "STRONG" | "GOOD" | "STRETCH";

export interface SkillRef {
  id: string;
  name: string;
  weight: number; // IDF weight from node_stats (0 if the skill is on no vacancy)
}

export interface ResolveResult {
  matched: SkillRef[]; // distinct SKILL nodes the input mapped to
  unmatched: string[]; // input skills with no SKILL node (taxonomy/extraction gap)
}

export interface RankedVacancy {
  id: string;
  title: string;
  company: string | null;
  seniority: Seniority | null;
  relevance: number; // Σ weight over overlap — the sort key
  fit: { tier: FitTier; matchedRequired: number; requiredTotal: number };
  diff: {
    have: SkillRef[]; // ✅ candidate skills the job wants (weight desc)
    missing: SkillRef[]; // ❌ required skills the candidate lacks (weight desc)
    bonus: SkillRef[]; // ➕ candidate skills the job doesn't ask for (weight desc)
  };
}

export interface MatchFilters {
  seniority?: Seniority;
  sourceId?: string;
  workFormat?: WorkFormat;
}

export interface MatchResponse {
  resolved: ResolveResult;
  items: RankedVacancy[];
  page: number;
  pageSize: number;
  total: number;
}

// Fit coverage → tier. Thresholds are v1 expert guesses (no ground truth yet);
// |required| = 0 is neutral → GOOD (tracker: never emit a fake %). The single
// place tiering lives, so calibration later is one edit.
export function fitTier(matchedRequired: number, requiredTotal: number): FitTier {
  if (requiredTotal === 0) return "GOOD";
  const coverage = matchedRequired / requiredTotal;
  if (coverage >= 0.8) return "STRONG";
  if (coverage >= 0.5) return "GOOD";
  return "STRETCH";
}
