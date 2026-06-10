import { TaxonomyAutoverifyActivity } from "./taxonomy-autoverify.activity";

export { TaxonomyAutoverifyActivity };

// Single source of truth for the taxonomy activity classes wired into both:
//   - the Temporal worker (registered as `activityClasses`)
//   - the TaxonomyModule providers (so DI can resolve them)
export const TAXONOMY_ACTIVITIES = [TaxonomyAutoverifyActivity] as const;
