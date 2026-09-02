import { and, eq, sql } from "drizzle-orm";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { uuidList } from "../../platform/shared/sql";

import {
  buildScoreBreakdown,
  fitPercent,
  TIER_BY_BUCKET,
  type MatchOverlay,
} from "./score.contract";
import { rankedCte } from "./score.sql";

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

// The viewer-facing wrapper: resolve the JWT user's ACTIVE CV (`user_cvs.
// isActive` — MVP is one active CV per user, ADR-0010-adjacent) and score
// against it. No account, or no CV linked, or no active one → empty map,
// same as an anonymous visitor. §7 step 2's "resolve the viewer's CV from
// the JWT" step; folds into `resolveFeedQuery` when step 3 builds it.
export async function overlayForUser(
  db: DrizzleDB,
  userId: string,
  positionIds: string[],
): Promise<Map<string, MatchOverlay>> {
  const candidateNodeIds = await activeCandidateNodeIds(db, userId);
  if (candidateNodeIds.length === 0) return new Map();
  return overlayFor(db, candidateNodeIds, positionIds);
}

async function activeCandidateNodeIds(db: DrizzleDB, userId: string): Promise<string[]> {
  const [cv] = await db
    .select({ candidateId: schema.userCvs.candidateId })
    .from(schema.userCvs)
    .where(and(eq(schema.userCvs.userId, userId), eq(schema.userCvs.isActive, true)))
    .limit(1);
  if (!cv) return [];

  const rows = await db
    .select({ nodeId: schema.candidateNodes.nodeId })
    .from(schema.candidateNodes)
    .where(eq(schema.candidateNodes.candidateId, cv.candidateId));
  return rows.map((r) => r.nodeId);
}
