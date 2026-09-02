import { sql, type SQL } from "drizzle-orm";

import { type FitTier } from "../ranking/ranking.contract";

import { buildScoreBreakdown, fitPercent, type ScoreBreakdown } from "./score.contract";
import { rankedCte } from "./score.sql";

// The seam MET-144 Part 1 leaves the feed with: it knows a nullable overlay and
// nothing else. The words `coverage`, `tier_bucket`, `relevance`, `on_stack`
// live behind this port — `FitScorer` owns the scoring SQL, the caller only
// splices its fragments into an otherwise score-free query.
//
//   WITH <cte()>                              -- absent for the anonymous path
//   page AS (SELECT p.…, <select()> FROM positions p <join()>
//            WHERE <buildWhere(filters)> [AND <filter()>])
//   SELECT * FROM page ORDER BY <order()>
//
// `overlay(row)` turns one page row back into the per-card match overlay.
export interface Scorer {
  // The scoring CTE block for the leading WITH; null when there is no scoring.
  cte(): SQL | null;
  // JOIN that attaches the score to `positions p`; empty for NullScorer.
  join(): SQL;
  // Extra SELECT columns (leading comma included); empty for NullScorer.
  select(): SQL;
  // Extra WHERE predicate (tier gate / overlap gate); null when none.
  filter(): SQL | null;
  // ORDER BY expression for `sort=score`.
  order(): SQL;
  // Per-row match overlay, or null when the row has no score.
  overlay(row: ScoreRow): MatchOverlay | null;
}

// One page row's scoring columns, as returned by `select()`.
export interface ScoreRow {
  relevance: number | null;
  coverage: number | null;
  on_stack: boolean | null;
  tier_bucket: number | null;
}

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

// The anonymous / cold path: no scoring at all.
export class NullScorer implements Scorer {
  cte(): SQL | null {
    return null;
  }
  join(): SQL {
    return sql``;
  }
  select(): SQL {
    return sql``;
  }
  filter(): SQL | null {
    return null;
  }
  order(): SQL {
    return sql``;
  }
  overlay(): MatchOverlay | null {
    return null;
  }
}

export interface FitScorerOptions {
  minFitTier?: FitTier;
}

// Today's live Fit scorer. Wraps `rankedCte` verbatim (the `ov` overlap probe
// included) — this port is a seam, not a rewrite of the formula.
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
      relevance: row.relevance ?? 0,
      onStack: row.on_stack ?? true,
      tier: TIER_BY_BUCKET[row.tier_bucket ?? 0],
      fitPercent: fitPercent(breakdown.total),
      breakdown,
    };
  }
}
