// Single source of truth for server-side analytics event names. Domain methods
// on AnalyticsService reference these — no event-name string literals scattered
// across the codebase. Keep snake_case (PostHog convention) and stable: renaming
// a value splits the metric in PostHog.
export const ANALYTICS_EVENTS = {
  subscriptionCreated: "subscription_created",
  telegramLinked: "telegram_linked",
  activationValueShown: "activation_value_shown",
  digestSent: "digest_sent",
  // Digest tap (attributed to a subscription) keeps its historical name so the
  // live funnel stays intact; anonymous web apply taps get their own event.
  digestLinkClicked: "digest_link_clicked",
  applyClicked: "apply_clicked",
  unsubscribed: "unsubscribed",
} as const;
