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
  // Telegram told us the user blocked the bot (or deliveries kept bouncing) —
  // the silent churn that `unsubscribed` never captures.
  botBlocked: "bot_blocked",
  matchScored: "match_scored",
} as const;

// Events a *person* causes, as opposed to ones we emit at them. "Last action"
// on the operator dashboard is the newest of these: counting our own hourly
// digest run would make every subscriber look active forever.
export const USER_ACTION_EVENTS = [
  ANALYTICS_EVENTS.landingView,
  ANALYTICS_EVENTS.landingCtaClicked,
  ANALYTICS_EVENTS.subscriptionCreateStarted,
  ANALYTICS_EVENTS.subscriptionHandoffOpened,
  ANALYTICS_EVENTS.subscriptionCreateFailed,
  ANALYTICS_EVENTS.subscriptionCreated,
  ANALYTICS_EVENTS.telegramLinked,
  ANALYTICS_EVENTS.digestLinkClicked,
  ANALYTICS_EVENTS.applyClicked,
  ANALYTICS_EVENTS.subscriptionReactivated,
  ANALYTICS_EVENTS.unsubscribed,
  ANALYTICS_EVENTS.botBlocked,
] as const;

// The complement: emitted by us (delivery pipeline, scoring), never by a tap.
export const SYSTEM_EMITTED_EVENTS = [
  ANALYTICS_EVENTS.activationValueShown,
  ANALYTICS_EVENTS.digestEvaluated,
  ANALYTICS_EVENTS.digestSent,
  ANALYTICS_EVENTS.digestDeliveryFailed,
  ANALYTICS_EVENTS.matchScored,
] as const;

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
