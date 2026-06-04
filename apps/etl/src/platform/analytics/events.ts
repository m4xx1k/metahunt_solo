// Single source of truth for server-side analytics event names. Domain methods
// on AnalyticsService reference these — no event-name string literals scattered
// across the codebase. Keep snake_case (PostHog convention) and stable: renaming
// a value splits the metric in PostHog.
export const ANALYTICS_EVENTS = {
  subscriptionCreated: "subscription_created",
  telegramLinked: "telegram_linked",
  digestSent: "digest_sent",
  digestLinkClicked: "digest_link_clicked",
  unsubscribed: "unsubscribed",
} as const;
