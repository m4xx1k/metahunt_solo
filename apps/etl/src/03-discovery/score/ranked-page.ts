import { sql, type SQL } from "drizzle-orm";

import type { DrizzleDB } from "@metahunt/database";

import type { FitTier } from "./score.contract";
import type { CandidateScorer } from "./scorer.port";

export interface RankedPageRow {
  id: string;
  relevance: number;
  coverage: number;
  on_stack: boolean;
  tier_bucket: number;
}

export interface RankedPageResult {
  rows: RankedPageRow[];
  total: number;
  /** Off-stack rows the page hid — always 0 when `includeOffStack` was set. */
  offStackHidden: number;
}

// The FULL PATH's shared page query (unified-feed-score.md §2.2, §3, §7 step
// 4): splice a scorer's `fragments()` into `where`, window `total` +
// `offStackHidden` once (before the off-stack filter removes rows a window
// function could no longer see), sort by score or date, page.
// `RankingService.rankByRefs` (the legacy match endpoints) and
// `FeedService.searchScored` (`GET /feed?sort=score`) both drive this — the
// SQL text doesn't move between them (`requireOverlap: true` always: §1, a
// zero-overlap Position is never a match on the full path).
export async function rankedPage(
  db: DrizzleDB,
  scorer: CandidateScorer,
  where: SQL,
  opts: {
    minFitTier?: FitTier;
    includeOffStack: boolean;
    byScore: boolean;
    page: number;
    pageSize: number;
  },
): Promise<RankedPageResult> {
  const frag = scorer.fragments({ minFitTier: opts.minFitTier, requireOverlap: true });
  const offset = (opts.page - 1) * opts.pageSize;
  const keep = opts.includeOffStack ? sql`true` : sql`on_stack`;
  // Score order only when explicitly asked; a date-sorted page still carries
  // the Fit number on every card, just not ordered by it.
  const pageOrder = opts.byScore ? frag.order : sql`posted_at DESC, id DESC`;

  const rankedPositionsCte = sql`
      ranked_positions AS (
        SELECT p.position_id::text AS id, ${frag.select},
               p.last_source_activity_at AS posted_at
        FROM ranked rk
        ${frag.join}
        WHERE ${where}${frag.filter ? sql` AND ${frag.filter}` : sql``}
      )`;

  const ranked = await db.execute<{
    id: string;
    relevance: number;
    coverage: number;
    on_stack: boolean;
    tier_bucket: number;
    total: number;
    off_stack_hidden: number;
  }>(sql`
      WITH ${frag.cte}, ${rankedPositionsCte},
      counted AS (
        SELECT id, relevance, coverage, on_stack, tier_bucket, posted_at,
               (count(*) FILTER (WHERE ${keep}) OVER ())::int AS total,
               (count(*) FILTER (WHERE NOT on_stack) OVER ())::int AS off_stack_hidden
        FROM ranked_positions
      )
      SELECT id, relevance, coverage, on_stack, tier_bucket, total, off_stack_hidden
      FROM counted
      WHERE ${keep}
      ORDER BY ${pageOrder}
      LIMIT ${opts.pageSize} OFFSET ${offset}
    `);

  if (ranked.rows.length > 0) {
    const { total, off_stack_hidden } = ranked.rows[0];
    return {
      rows: ranked.rows,
      total,
      offStackHidden: opts.includeOffStack ? 0 : off_stack_hidden,
    };
  }

  // Empty page (all filtered out, or OFFSET past the end): the window pass
  // above returned no row, so no counts either — a dedicated count instead.
  const totalRes = await db.execute<{ count: number; off_stack_hidden: number }>(sql`
      WITH ${frag.cte}, ${rankedPositionsCte}
      SELECT (count(*) FILTER (WHERE ${keep}))::int AS count,
             (count(*) FILTER (WHERE NOT on_stack))::int AS off_stack_hidden
      FROM ranked_positions
    `);
  return {
    rows: [],
    total: totalRes.rows[0]?.count ?? 0,
    offStackHidden: opts.includeOffStack ? 0 : (totalRes.rows[0]?.off_stack_hidden ?? 0),
  };
}
