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
  digestLinkClicked: "digest_link_clicked",
  applyClicked: "apply_clicked",
  vacancyOutboundClicked: "vacancy_outbound_clicked",
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
  ANALYTICS_EVENTS.vacancyOutboundClicked,
  ANALYTICS_EVENTS.subscriptionReactivated,
  ANALYTICS_EVENTS.unsubscribed,
] as const;

export const SYSTEM_EMITTED_EVENTS = [
  ANALYTICS_EVENTS.activationValueShown,
  ANALYTICS_EVENTS.digestEvaluated,
  ANALYTICS_EVENTS.digestSent,
  ANALYTICS_EVENTS.digestDeliveryFailed,
  // Recorded when WE detect the block (my_chat_member or bounced sends), so
  // its timestamp is detection time — it must not read as "the user acted".
  ANALYTICS_EVENTS.botBlocked,
  ANALYTICS_EVENTS.matchScored,
] as const;

export type ProductEventSource = DatabaseProductEventSource;

export function posthogEventName(name: string): string {
  return name === ANALYTICS_EVENTS.digestLinkClicked || name === ANALYTICS_EVENTS.applyClicked
    ? ANALYTICS_EVENTS.vacancyOutboundClicked
    : name;
}
import type { ProductEventSource as DatabaseProductEventSource } from "@metahunt/database";
