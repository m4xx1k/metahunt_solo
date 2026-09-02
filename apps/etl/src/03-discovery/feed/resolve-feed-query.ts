import type { DrizzleDB } from "@metahunt/database";

import { createCandidateScorer, type CandidateScorer } from "../score/scorer.port";

import type { FeedSearchParams } from "./feed.service";

export interface ResolvedFeedQuery {
  filters: FeedSearchParams;
  scorer: CandidateScorer | null;
}

// The composition root for a candidate-aware feed query (unified-feed-score.md
// §5): the ONLY code in the feed path that knows candidates exist.
// `candidateId` is already resolved by the caller — the viewer's active CV via
// the JWT, or an allowlisted `?sample=` id (unified-feed-score.md §8) — never
// a raw query param for a real user. `null` (anonymous, or a candidate with
// zero skill nodes) yields `scorer: null`, and every card renders `match: null`.
//
// CHEAP PATH only for now (§7 step 3): `filters` passes through untouched, and
// `FeedService.search` uses the scorer for one `overlayFor(pageIds)` call
// after the page is chosen — it never shapes the result SET or its ORDER BY.
// `sort` joins this return shape in step 4, when `sort=score` starts driving
// the FULL PATH instead.
export async function resolveFeedQuery(
  db: DrizzleDB,
  candidateId: string | null,
  filters: FeedSearchParams,
): Promise<ResolvedFeedQuery> {
  const scorer = candidateId ? await createCandidateScorer(db, candidateId) : null;
  return { filters, scorer };
}
