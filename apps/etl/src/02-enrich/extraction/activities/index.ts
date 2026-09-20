import { StalePostingsActivity } from "./stale-postings.activity";

export { StalePostingsActivity };
export type { StalePostingsQuery } from "./stale-postings.activity";

// Single source of truth for the extraction activity classes wired into both
// the Temporal worker and the ExtractionModule providers (mirrors RSS_ACTIVITIES).
export const EXTRACTION_ACTIVITIES = [StalePostingsActivity] as const;
