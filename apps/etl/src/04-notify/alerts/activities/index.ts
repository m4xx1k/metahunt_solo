import { AlertsActivity } from "./alerts.activity";

export { AlertsActivity };

// Registered in both the Temporal worker and TelegramModule, like TELEGRAM_ACTIVITIES.
export const ALERTS_ACTIVITIES = [AlertsActivity] as const;
