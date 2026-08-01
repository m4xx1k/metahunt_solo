// The one place that says what every analytics event means. Two producers feed
// it: the server ledger (apps/etl/src/platform/analytics/events.ts) and the
// browser-only client (apps/web/lib/analytics/use-analytics.ts). Only ledger
// events reach Postgres, so only they can appear in this console's widgets —
// `sink` records that difference instead of letting the screen imply coverage
// it does not have. Keep in sync with `pnpm analytics:catalog`.

export type EventActor = "user" | "system";
export type EventSink = "ledger" | "posthog-only";

export interface AnalyticsEventDoc {
  name: string;
  label: string;
  actor: EventActor;
  sink: EventSink;
  means: string;
}

// `countsAsLastAction` is derived, not declared: the roster's "last action" is
// exactly the user-caused events the ledger can see. Deriving it means the
// tooltip cannot drift from USER_ACTION_EVENTS on the server.
export function countsAsLastAction(event: AnalyticsEventDoc): boolean {
  return event.actor === "user" && event.sink === "ledger";
}

export const EVENT_CATALOG: AnalyticsEventDoc[] = [
  {
    name: "landing_view",
    label: "landing view",
    actor: "user",
    sink: "ledger",
    means: "opened the marketing landing",
  },
  {
    name: "landing_cta_clicked",
    label: "cta click",
    actor: "user",
    sink: "ledger",
    means: "tapped the landing call to action",
  },
  {
    name: "subscription_create_started",
    label: "sub started",
    actor: "user",
    sink: "ledger",
    means: "submitted the subscribe form",
  },
  {
    name: "subscription_handoff_opened",
    label: "telegram opened",
    actor: "user",
    sink: "ledger",
    means: "left for Telegram to finish subscribing",
  },
  {
    name: "subscription_create_failed",
    label: "sub failed",
    actor: "user",
    sink: "ledger",
    means: "the subscribe request errored",
  },
  {
    name: "subscription_created",
    label: "sub created",
    actor: "user",
    sink: "ledger",
    means: "a subscription row now exists",
  },
  {
    name: "telegram_linked",
    label: "telegram linked",
    actor: "user",
    sink: "ledger",
    means: "chat bound to the subscription — the growth anchor",
  },
  {
    name: "digest_link_clicked",
    label: "digest click",
    actor: "user",
    sink: "ledger",
    means: "tapped a job inside a Telegram digest",
  },
  {
    name: "apply_clicked",
    label: "feed click",
    actor: "user",
    sink: "ledger",
    means: "tapped a job in the web feed",
  },
  {
    name: "subscription_reactivated",
    label: "reactivated",
    actor: "user",
    sink: "ledger",
    means: "turned a dead subscription back on",
  },
  {
    name: "unsubscribed",
    label: "unsubscribed",
    actor: "user",
    sink: "ledger",
    means: "stopped one or all subscriptions",
  },
  {
    name: "activation_value_shown",
    label: "first jobs shown",
    actor: "system",
    sink: "ledger",
    means: "we delivered their first matching jobs",
  },
  {
    name: "digest_evaluated",
    label: "digest evaluated",
    actor: "system",
    sink: "ledger",
    means: "we checked whether a digest was due",
  },
  {
    name: "digest_sent",
    label: "digest sent",
    actor: "system",
    sink: "ledger",
    means: "we pushed a digest to a chat",
  },
  {
    name: "digest_delivery_failed",
    label: "delivery failed",
    actor: "system",
    sink: "ledger",
    means: "a send bounced, transiently or for good",
  },
  {
    name: "bot_blocked",
    label: "bot blocked",
    actor: "system",
    sink: "ledger",
    means: "Telegram told us the bot was cut off",
  },
  {
    name: "match_scored",
    label: "match scored",
    actor: "system",
    sink: "ledger",
    means: "a CV was ranked against the feed",
  },
  {
    name: "lens_switch",
    label: "lens switch",
    actor: "user",
    sink: "posthog-only",
    means: "toggled between the market and CV lens",
  },
  {
    name: "cv_upload_started",
    label: "cv upload started",
    actor: "user",
    sink: "posthog-only",
    means: "picked a CV file",
  },
  {
    name: "cv_upload_completed",
    label: "cv uploaded",
    actor: "user",
    sink: "posthog-only",
    means: "the CV parsed into a candidate",
  },
  {
    name: "cv_upload_failed",
    label: "cv upload failed",
    actor: "user",
    sink: "posthog-only",
    means: "the CV could not be parsed",
  },
  {
    name: "telegram_login_started",
    label: "tg login started",
    actor: "user",
    sink: "posthog-only",
    means: "began signing in with Telegram",
  },
  {
    name: "telegram_login_cancelled",
    label: "tg login cancelled",
    actor: "user",
    sink: "posthog-only",
    means: "abandoned the Telegram sign-in",
  },
  {
    name: "telegram_login_failed",
    label: "tg login failed",
    actor: "user",
    sink: "posthog-only",
    means: "the Telegram sign-in errored",
  },
  {
    name: "google_login_failed",
    label: "google login failed",
    actor: "user",
    sink: "posthog-only",
    means: "the Google sign-in errored",
  },
  {
    name: "identity_linked",
    label: "provider linked",
    actor: "user",
    sink: "posthog-only",
    means: "attached a second sign-in provider",
  },
  {
    name: "identity_unlinked",
    label: "provider unlinked",
    actor: "user",
    sink: "posthog-only",
    means: "detached a sign-in provider",
  },
  {
    name: "identity_link_conflict",
    label: "link conflict",
    actor: "user",
    sink: "posthog-only",
    means: "that provider already belongs to another account",
  },
  {
    name: "logged_in",
    label: "logged in",
    actor: "user",
    sink: "posthog-only",
    means: "signed in with any provider",
  },
  {
    name: "signup",
    label: "signup",
    actor: "user",
    sink: "posthog-only",
    means: "first-ever sign-in for this account",
  },
  {
    name: "vacancy_feedback",
    label: "vacancy feedback",
    actor: "user",
    sink: "posthog-only",
    means: "voted a job up or down",
  },
  {
    name: "bait_click",
    label: "bait click",
    actor: "user",
    sink: "posthog-only",
    means: "tapped an AI helper we have not built",
  },
  {
    name: "match_flow_started",
    label: "match started",
    actor: "user",
    sink: "posthog-only",
    means: "entered the /match onboarding",
  },
  {
    name: "match_flow_completed",
    label: "match completed",
    actor: "user",
    sink: "posthog-only",
    means: "finished /match onboarding",
  },
  {
    name: "feed_score_locked",
    label: "score locked",
    actor: "user",
    sink: "posthog-only",
    means: "tapped the locked Fit slot on a cold /feed card",
  },
];

const BY_NAME = new Map(EVENT_CATALOG.map((event) => [event.name, event]));

export function findEvent(name: string): AnalyticsEventDoc | undefined {
  return BY_NAME.get(name);
}

export function lastActionEventLabels(): string[] {
  return EVENT_CATALOG.filter(countsAsLastAction).map((event) => event.label);
}
