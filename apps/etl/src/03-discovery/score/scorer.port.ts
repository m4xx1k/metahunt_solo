import { and, eq, sql, type SQL } from "drizzle-orm";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { NodeRef } from "../../platform/shared/contract";
import { uuidList } from "../../platform/shared/sql";

import {
  buildScoreBreakdown,
  fitPercent,
  TIER_BUCKET,
  TIER_BY_BUCKET,
  type FitTier,
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
// the JWT" step for the single-vacancy page.
export async function overlayForUser(
  db: DrizzleDB,
  userId: string,
  positionIds: string[],
): Promise<Map<string, MatchOverlay>> {
  const candidateId = await resolveActiveCandidateId(db, userId);
  if (!candidateId) return new Map();
  return overlayFor(db, await candidateNodeIds(db, candidateId), positionIds);
}

// Exported for callers that need the candidateId itself, not just the
// overlay — resolve-feed-query.ts's `?sample=` fallback (§8) resolves a
// candidateId either way and wants one composition path for both sources.
export async function resolveActiveCandidateId(
  db: DrizzleDB,
  userId: string,
): Promise<string | null> {
  const [cv] = await db
    .select({ candidateId: schema.userCvs.candidateId })
    .from(schema.userCvs)
    .where(and(eq(schema.userCvs.userId, userId), eq(schema.userCvs.isActive, true)))
    .limit(1);
  return cv?.candidateId ?? null;
}

// §8's wrinkle: sample CVs are public fixtures, not user data, so `GET
// /feed?sample=<id>` may resolve a scorer from a bare query param — but ONLY
// when the id is a seeded sample candidate (`candidates.type = 'sample'`).
// Anything else (a real candidate id, garbage) resolves to null so the
// caller 404s rather than silently falling back to anonymous.
export async function resolveSampleCandidateId(
  db: DrizzleDB,
  sampleId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ type: schema.candidates.type })
    .from(schema.candidates)
    .where(eq(schema.candidates.id, sampleId))
    .limit(1);
  return row?.type === "sample" ? sampleId : null;
}

async function candidateNodeIds(db: DrizzleDB, candidateId: string): Promise<string[]> {
  const rows = await db
    .select({ nodeId: schema.candidateNodes.nodeId })
    .from(schema.candidateNodes)
    .where(eq(schema.candidateNodes.candidateId, candidateId));
  return rows.map((r) => r.nodeId);
}

// The viewer's resolved skill set (id + name), not just ids — §4's vacancy-
// detail skill diff needs the candidate's own names for its "➕ bonus" column
// (skills the candidate has that this vacancy doesn't ask for), which the
// vacancy's own already-fetched skills can't supply. One query, same shape
// as `overlayForUser`'s candidateId resolution, just a richer SELECT.
export async function resolveViewerSkills(db: DrizzleDB, userId: string): Promise<NodeRef[]> {
  const candidateId = await resolveActiveCandidateId(db, userId);
  if (!candidateId) return [];
  const rows = await db
    .select({ id: schema.nodes.id, name: schema.nodes.canonicalName })
    .from(schema.candidateNodes)
    .innerJoin(schema.nodes, eq(schema.nodes.id, schema.candidateNodes.nodeId))
    .where(eq(schema.candidateNodes.candidateId, candidateId));
  return rows;
}

// The FULL PATH's SQL-splice half of §3 — what a consumer already running its
// own ranked-page query (rankByRefs today; the feed's own sort=score later)
// stitches in, in place of building this SQL itself. `filter`/`order` use
// BARE column names (`tier_bucket`, `relevance`, `id`…) — they're meant for
// the outer SELECT of whatever CTE embeds `cte`+`join`+`select`, not for a
// clause qualified against the `rk` alias `cte`/`join`/`select` use.
export interface ScoringFragments {
  cte: SQL;
  join: SQL;
  select: SQL;
  filter: SQL | null;
  order: SQL;
}

// CandidateScorer (§3): the bound, candidate-scoped face of the primitives
// above — what `resolveFeedQuery` hands `FeedService.search` once a
// candidateId is resolved (JWT active CV, or an allowlisted `?sample=`).
export interface CandidateScorer {
  overlayFor(positionIds: string[]): Promise<Map<string, MatchOverlay>>;
  fragments(opts: { minFitTier?: FitTier; requireOverlap?: boolean }): ScoringFragments;
}

// The lower-level factory: build a scorer straight from resolved node ids,
// no candidateId / DB lookup needed. `rankByRefs`'s plain-text-skills path
// (`RankingService.match`) never creates a `candidates` row, so it can't go
// through `createCandidateScorer` below — this is what it (and that below)
// both drive.
export function scorerForNodeIds(db: DrizzleDB, candidateNodeIds: string[]): CandidateScorer {
  const cand = sql.join(
    candidateNodeIds.map((id) => sql`(${id}::uuid)`),
    sql`, `,
  );
  return {
    overlayFor: (positionIds) => overlayFor(db, candidateNodeIds, positionIds),
    fragments: (opts) => {
      const overlapCond = opts.requireOverlap ? sql`rk.relevance IS NOT NULL` : null;
      const minBucket = opts.minFitTier !== undefined ? TIER_BUCKET[opts.minFitTier] : 0;
      const tierCond = minBucket > 0 ? sql`rk.tier_bucket >= ${minBucket}` : null;
      const conds = [overlapCond, tierCond].filter((c): c is SQL => c !== null);
      return {
        cte: rankedCte(cand),
        join: sql`JOIN positions p ON p.position_id = rk.id`,
        select: sql`rk.relevance, rk.coverage, rk.on_stack, rk.tier_bucket`,
        filter: conds.length > 0 ? sql.join(conds, sql` AND `) : null,
        // Score order only — a date-sorted page ignores this fragment.
        order: sql`tier_bucket DESC, round(relevance::numeric, 9) DESC, id`,
      };
    },
  };
}

// null when the candidate resolves to no skill nodes at all — same
// "nothing to score" outcome as no candidate, so callers can treat both
// uniformly (`scorer: CandidateScorer | null`).
export async function createCandidateScorer(
  db: DrizzleDB,
  candidateId: string,
): Promise<CandidateScorer | null> {
  const nodeIds = await candidateNodeIds(db, candidateId);
  if (nodeIds.length === 0) return null;
  return scorerForNodeIds(db, nodeIds);
}
