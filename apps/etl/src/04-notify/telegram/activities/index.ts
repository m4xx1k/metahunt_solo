import { NotifyActivity } from "./notify.activity";

export { NotifyActivity };

// Single source of truth for the telegram activity classes wired into both:
//   - the Temporal worker (registered as `activityClasses`)
//   - the TelegramModule providers (so DI can resolve them)
export const TELEGRAM_ACTIVITIES = [NotifyActivity] as const;
