import type { DrizzleDB } from "@metahunt/database";

import type { NodeRef } from "../../platform/shared/contract";
import {
  createCandidateScorer,
  resolveCandidateSkills,
  type CandidateScorer,
} from "../score/scorer.port";

import type { FeedSearchParams } from "./feed.service";

export interface ResolvedFeedQuery {
  filters: FeedSearchParams;
  scorer: CandidateScorer | null;
  /** The candidate's resolved skills (id + name), for the cold card's
   *  client-side have/missing/bonus counts (§6). `null` when there is no
   *  candidate — the cards render `match: null` and no diff either way. */
  viewerSkills: NodeRef[] | null;
}

// The composition root for a candidate-aware feed query (unified-feed-score.md
// §5): the ONLY code in the feed path that knows candidates exist.
// `candidateId` is already resolved by the caller — the viewer's active CV via
// the JWT, or an allowlisted `?sample=` id (unified-feed-score.md §8) — never
// a raw query param for a real user. `null` (anonymous, or a candidate with
// zero skill nodes) yields `scorer: null`, and every card renders `match: null`.
//
// `filters` (including `sort`/`minFitTier`) passes through untouched — this
// function only ever resolves the scorer. `FeedService.search` is what
// decides cheap vs full path from `filters` + whether a scorer came back
// (§7 step 4): cheap uses the scorer for one `overlayFor(pageIds)` call after
// the page is chosen; full splices `scorer.fragments()` into the page query
// itself, the same way `RankingService.rankByRefs` does.
export async function resolveFeedQuery(
  db: DrizzleDB,
  candidateId: string | null,
  filters: FeedSearchParams,
): Promise<ResolvedFeedQuery> {
  if (!candidateId) return { filters, scorer: null, viewerSkills: null };
  const [scorer, viewerSkills] = await Promise.all([
    createCandidateScorer(db, candidateId),
    resolveCandidateSkills(db, candidateId),
  ]);
  return { filters, scorer, viewerSkills };
}
