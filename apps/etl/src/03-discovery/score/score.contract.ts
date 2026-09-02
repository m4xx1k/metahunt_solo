// The Fit score contract. Deliberately a BREAKDOWN, not a float: the number on
// a card is about to grow more signals (skill coefficients, domain boost,
// seniority), and each of those is one more array entry — no shape change, no
// UI change (the tooltip renders `signals`). Today exactly one signal is live.
//
// Framework-free by design (no NestJS/Drizzle import) — score/scorer.port.ts,
// score/score.sql.ts, ranking/ranking.contract.ts and feed/feed.contract.ts
// all depend on this file; it depends on nothing else in 03-discovery, so
// none of those can end up circular.

// Fit-tier vocabulary. Lives here (not in ranking.contract.ts, which used to
// own it) so `MatchOverlay` below can reference it without importing back out
// of this file — ranking.contract.ts re-exports both for its own callers.
export const FIT_TIER_VALUES = ["STRONG", "GOOD", "STRETCH"] as const;
export type FitTier = (typeof FIT_TIER_VALUES)[number];

// What a ranked page is ordered by — moved here alongside FitTier (same
// reason: feed.contract.ts needs it for GET /feed's own `sort`, and importing
// it from ranking.contract.ts would be circular — that file imports
// VacancyDto from feed.contract.ts). "score" is the Fit order (the FULL
// PATH); "date" is freshness (the CHEAP PATH), with the score still shown on
// every card either way.
export const MATCH_SORT_VALUES = ["score", "date"] as const;
export type MatchSort = (typeof MATCH_SORT_VALUES)[number];

// Ordinal <-> tier, mirroring the SQL tier_bucket CASE in score.sql.ts's
// rankedCte (2=STRONG, 1=GOOD, 0=STRETCH). One home for both directions so
// the scorer (scorer.port.ts) and the ranked-page consumer (ranking.service.ts)
// can't drift apart on what a bucket number means.
export const TIER_BY_BUCKET: readonly FitTier[] = ["STRETCH", "GOOD", "STRONG"];
export const TIER_BUCKET: Record<FitTier, number> = { STRETCH: 0, GOOD: 1, STRONG: 2 };

// A vacancy card's personalized overlay — everything the Fit badge needs. The
// skill diff (✅/❌/➕) is NOT here: it's computed in TS from data the caller
// already has (the position's skills + the candidate's node ids), see
// md/journal/migrations/unified-feed-score.md §4.
export interface MatchOverlay {
  relevance: number;
  coverage: number;
  tier: FitTier;
  percent: number;
  onStack: boolean;
}

export const SCORE_SIGNAL_KINDS = ["skill-overlap"] as const;
export type ScoreSignalKind = (typeof SCORE_SIGNAL_KINDS)[number];

export interface ScoreSignal {
  kind: ScoreSignalKind;
  raw: number; // the signal's own measurement in its own units (coverage: 0..1)
  weight: number; // how much of the total this signal may move
  contribution: number; // raw * weight — what actually landed in `total`
}

export interface ScoreBreakdown {
  total: number; // 0..1, Σ contribution — `fitPercent` is its display form
  signals: ScoreSignal[];
}

// Weight of the only live signal. It is 1 because skill overlap IS the score
// today; adding a second signal means splitting this budget, once, here.
export const SKILL_OVERLAP_WEIGHT = 1;

const clamp01 = (n: number): number => (n > 1 ? 1 : n > 0 ? n : 0);

// The user-facing "Fit %": a whole number, so a card never shows 87.3%. Floor,
// not round — the tiers compare the raw coverage, and a rounded-up 49.5% next
// to a "stretch" badge reads as a bug.
export const fitPercent = (total: number): number => Math.floor(clamp01(total) * 100);

// IDF-weighted required coverage (the `coverage` column of the scoring CTE) is
// the whole score today, so total === coverage.
export function buildScoreBreakdown(coverage: number): ScoreBreakdown {
  const raw = clamp01(coverage);
  const contribution = raw * SKILL_OVERLAP_WEIGHT;
  return {
    total: contribution,
    signals: [{ kind: "skill-overlap", raw, weight: SKILL_OVERLAP_WEIGHT, contribution }],
  };
}
