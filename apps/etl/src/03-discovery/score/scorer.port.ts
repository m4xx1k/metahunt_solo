import { sql, type SQL } from "drizzle-orm";

import { type FitTier } from "../ranking/ranking.contract";

import { buildScoreBreakdown, fitPercent, type ScoreBreakdown } from "./score.contract";
import { rankedCte } from "./score.sql";

// Fragments, not a query builder: the caller owns the query shape, the scorer
// owns every score column, predicate and sort key that goes into it. MET-144
// Part 1 leaves the feed knowing a nullable overlay and nothing else.
export interface Scorer {
  // Leading WITH block; null when there is no scoring.
  cte(): SQL | null;
  // JOIN onto `positions p`, in the page/ranked-positions scope.
  join(): SQL;
  // Extra SELECT columns for the page scope; the caller supplies the commas.
  select(): SQL;
  // Extra predicate for the page scope (alias `rk`); null when none.
  filter(): SQL | null;
  // ORDER BY expression for `sort=score` — the OUTER projection, bare columns.
  order(): SQL;
  // Per-row match overlay, or null when the row has no score.
  overlay(row: ScoreRow): MatchOverlay | null;
}

// One page row's scoring columns, as returned by `select()`. A type alias, not
// an interface, so `& ScoreRow` still satisfies db.execute's Record constraint.
export type ScoreRow = {
  relevance: number | null;
  coverage: number | null;
  on_stack: boolean | null;
  tier_bucket: number | null;
};

// The score-derived half of a ranked card. `matchedRequired` / `requiredTotal`
// are the per-page skill-diff's job, not the scorer's.
export interface MatchOverlay {
  relevance: number;
  onStack: boolean;
  tier: FitTier;
  fitPercent: number;
  breakdown: ScoreBreakdown;
}

// Ordinal of each Fit tier, mirroring the SQL tier_bucket CASE. minFitTier keeps
// rows with tier_bucket >= the requested tier's ordinal.
export const TIER_BUCKET: Record<FitTier, number> = { STRETCH: 0, GOOD: 1, STRONG: 2 };
// Inverse: SQL tier_bucket ordinal → Fit badge (index = bucket).
export const TIER_BY_BUCKET = ["STRETCH", "GOOD", "STRONG"] as const;

export interface FitScorerOptions {
  minFitTier?: FitTier;
}

// Today's live Fit scorer. Wraps `rankedCte` verbatim, `ov` probe included.
export class FitScorer implements Scorer {
  constructor(
    private readonly cand: SQL,
    private readonly opts: FitScorerOptions = {},
  ) {}

  cte(): SQL {
    return rankedCte(this.cand);
  }

  join(): SQL {
    return sql`JOIN ranked rk ON rk.id = p.position_id`;
  }

  select(): SQL {
    return sql`rk.relevance, rk.coverage, rk.on_stack, rk.tier_bucket`;
  }

  filter(): SQL | null {
    const bucket = this.opts.minFitTier !== undefined ? TIER_BUCKET[this.opts.minFitTier] : 0;
    return bucket > 0 ? sql`rk.tier_bucket >= ${bucket}` : null;
  }

  order(): SQL {
    // round so exact-IDF ties break by id (raw float-sum order is plan noise).
    return sql`tier_bucket DESC, round(relevance::numeric, 9) DESC, id`;
  }

  overlay(row: ScoreRow): MatchOverlay {
    const breakdown = buildScoreBreakdown(row.coverage ?? 0);
    return {
      // relevance is the one agg column with no COALESCE (score.sql.ts) — NULL
      // only if node_stats drops every matched row; render it as 0, not a lie.
      relevance: row.relevance ?? 0,
      onStack: row.on_stack ?? true,
      tier: TIER_BY_BUCKET[row.tier_bucket ?? 0],
      fitPercent: fitPercent(breakdown.total),
      breakdown,
    };
  }
}
