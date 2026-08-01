// The Fit score contract. Deliberately a BREAKDOWN, not a float: the number on
// a card is about to grow more signals (skill coefficients, domain boost,
// seniority), and each of those is one more array entry — no shape change, no
// UI change (the tooltip renders `signals`). Today exactly one signal is live.

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

// The user-facing "Fit %": a whole number, so a card never shows 87.3%.
export const fitPercent = (total: number): number => Math.round(clamp01(total) * 100);

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
