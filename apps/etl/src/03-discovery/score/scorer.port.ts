import { sql } from "drizzle-orm";

import type { DrizzleDB } from "@metahunt/database";

import { uuidList } from "../../platform/shared/sql";
import type { FitTier } from "../ranking/ranking.contract";

import { buildScoreBreakdown, fitPercent } from "./score.contract";
import { rankedCte } from "./score.sql";

// Mirrors the SQL tier_bucket CASE in score.sql.ts's rankedCte (2=STRONG,
// 1=GOOD, 0=STRETCH) — same duplication ranking.service.ts already carries
// locally; the two collapse into one home once the full path drives this
// module too (§7 step 4).
const TIER_BY_BUCKET: readonly FitTier[] = ["STRETCH", "GOOD", "STRONG"];

// A vacancy card's personalized overlay — everything the Fit badge needs.
// The skill diff (✅/❌/➕) is NOT here: it's computed in TS from data the
// caller already has (the position's skills + the candidate's node ids), see
// md/journal/migrations/unified-feed-score.md §4.
export interface MatchOverlay {
  relevance: number;
  coverage: number;
  tier: FitTier;
  percent: number;
  onStack: boolean;
}

// CHEAP PATH primitive (unified-feed-score.md §2.1, §3): score a fixed,
// already-chosen set of positions — ~2 ms for a page of 20. Every non-ranked
// surface (feed page, single vacancy, Telegram digest) is one call to this.
// `scopeIds` on `scoringCtes` is what makes it cheap: it narrows the
// ~144k-row position_nodes fan-out to just these positions before scoring.
//
// A position with no entry in the returned map has nothing to score (no
// position_nodes rows in scope) — the caller renders `match: null` for it.
export async function overlayFor(
  db: DrizzleDB,
  candidateNodeIds: string[],
  positionIds: string[],
): Promise<Map<string, MatchOverlay>> {
  const overlay = new Map<string, MatchOverlay>();
  if (candidateNodeIds.length === 0 || positionIds.length === 0) return overlay;

  const cand = sql.join(
    candidateNodeIds.map((id) => sql`(${id}::uuid)`),
    sql`, `,
  );

  const result = await db.execute<{
    id: string;
    relevance: number | null;
    coverage: number;
    tier_bucket: number;
    on_stack: boolean;
  }>(sql`
      WITH ${rankedCte(cand, uuidList(positionIds))}
      SELECT id, relevance, coverage, tier_bucket, on_stack FROM ranked
    `);

  for (const row of result.rows) {
    overlay.set(row.id, {
      // NULL only when the position shares zero skills with the candidate —
      // scoped rows still carry a real (possibly 0) coverage/tier either way.
      relevance: row.relevance ?? 0,
      coverage: row.coverage,
      tier: TIER_BY_BUCKET[row.tier_bucket],
      percent: fitPercent(buildScoreBreakdown(row.coverage).total),
      onStack: row.on_stack,
    });
  }
  return overlay;
}
