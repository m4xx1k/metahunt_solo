// Single source of truth for server-side analytics event names. Domain methods
// on AnalyticsService reference these — no event-name string literals scattered
// across the codebase. Keep snake_case (PostHog convention) and stable: renaming
// a value splits the metric in PostHog.
export const ANALYTICS_EVENTS = {
  landingView: "landing_view",
  landingCtaClicked: "landing_cta_clicked",
  subscriptionCreateStarted: "subscription_create_started",
  subscriptionHandoffOpened: "subscription_handoff_opened",
  subscriptionCreateFailed: "subscription_create_failed",
  subscriptionCreated: "subscription_created",
  telegramLinked: "telegram_linked",
  activationValueShown: "activation_value_shown",
  digestEvaluated: "digest_evaluated",
  digestSent: "digest_sent",
  digestDeliveryFailed: "digest_delivery_failed",
  // Digest tap (attributed to a subscription) keeps its historical name so the
  // live funnel stays intact; anonymous web apply taps get their own event.
  digestLinkClicked: "digest_link_clicked",
  applyClicked: "apply_clicked",
  subscriptionReactivated: "subscription_reactivated",
  unsubscribed: "unsubscribed",
} as const;

export const BROWSER_ANALYTICS_EVENTS = [
  ANALYTICS_EVENTS.landingView,
  ANALYTICS_EVENTS.landingCtaClicked,
  ANALYTICS_EVENTS.subscriptionCreateStarted,
  ANALYTICS_EVENTS.subscriptionHandoffOpened,
  ANALYTICS_EVENTS.subscriptionCreateFailed,
] as const;

export type BrowserAnalyticsEventName = (typeof BROWSER_ANALYTICS_EVENTS)[number];
export type ProductEventSource = DatabaseProductEventSource;
import type { ProductEventSource as DatabaseProductEventSource } from "@metahunt/database";
