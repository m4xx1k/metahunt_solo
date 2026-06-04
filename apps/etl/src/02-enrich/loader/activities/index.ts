import { LoadVacancyActivity } from "./load-vacancy.activity";

export { LoadVacancyActivity };

// Single source of truth for the loader activity classes wired into both:
//   - the Temporal worker (registered as `activityClasses`)
//   - the LoaderModule providers (so DI can resolve them)
export const LOADER_ACTIVITIES = [LoadVacancyActivity] as const;
