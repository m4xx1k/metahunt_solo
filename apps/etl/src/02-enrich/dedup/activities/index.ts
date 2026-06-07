import { DedupSweepActivity } from "./dedup-sweep.activity";

export { DedupSweepActivity };

// Single source of truth for the dedup activity classes wired into both:
//   - the Temporal worker (registered as `activityClasses`)
//   - the DedupModule providers (so DI can resolve them)
export const DEDUP_ACTIVITIES = [DedupSweepActivity] as const;
