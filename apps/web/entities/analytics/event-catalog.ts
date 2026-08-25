// The one place that says what every analytics event means. Two producers feed
// it: the server (apps/etl/src/platform/analytics/events.ts) and the
// browser-only client (apps/web/lib/analytics/use-analytics.ts). Every name
// here lands in PostHog and nowhere else — the Postgres ledger retired in phase
// 4 of analytics-one-identity. Keep in sync with `pnpm analytics:catalog`.

export type EventActor = "user" | "system";

export interface AnalyticsEventDoc {
  name: string;
  label: string;
  actor: EventActor;
  means: string;
  /** No producer left in the code — only rows written before it was retired. */
  historic?: true;
}

export const EVENT_CATALOG: AnalyticsEventDoc[] = [
  {
    name: "$pageview",
    label: "pageview",
    actor: "user",
    means: "opened a page — posthog-js captures it, no product code involved",
  },
  {
    name: "subscription_deactivated",
    label: "sub stopped",
    actor: "user",
    means: "a subscription stopped — `reason` says whether it was a stop, a block or a dead chat",
  },
  {
    name: "subscription_create_failed",
    label: "sub failed",
    actor: "user",
    means: "the subscribe request errored (ledger rows are historic)",
  },
  {
    name: "subscription_created",
    label: "sub created",
    actor: "user",
    means: "a subscription row now exists",
  },
  {
    name: "telegram_linked",
    label: "telegram linked",
    actor: "user",
    means: "chat bound to the subscription — the growth anchor",
  },
  {
    name: "vacancy_outbound_clicked",
    label: "vacancy outbound click",
    actor: "user",
    means: "opened a vacancy from the feed or a Telegram digest, and we know who",
  },
  {
    name: "vacancy_outbound_unattributed",
    label: "unattributed outbound click",
    actor: "user",
    means:
      "opened a vacancy through a link carrying neither a subscription nor a " +
      "browser journey — real volume, no one to credit it to",
  },
  {
    name: "digest_sent",
    label: "digest sent",
    actor: "system",
    means: "we pushed a digest to a chat",
  },
  {
    name: "match_scored",
    label: "match scored",
    actor: "system",
    means: "a CV was ranked against the feed",
  },
  {
    name: "cv_upload_completed",
    label: "cv uploaded",
    actor: "user",
    means: "the CV parsed into a candidate",
  },
  {
    name: "cv_upload_failed",
    label: "cv upload failed",
    actor: "user",
    means: "the CV could not be parsed",
  },
  {
    name: "telegram_login_cancelled",
    label: "tg login cancelled",
    actor: "user",
    means: "abandoned the Telegram sign-in",
  },
  {
    name: "telegram_login_failed",
    label: "tg login failed",
    actor: "user",
    means: "the Telegram sign-in errored",
  },
  {
    name: "google_login_failed",
    label: "google login failed",
    actor: "user",
    means: "the Google sign-in errored",
  },
  {
    name: "identity_linked",
    label: "provider linked",
    actor: "user",
    means: "attached a second sign-in provider",
  },
  {
    name: "identity_unlinked",
    label: "provider unlinked",
    actor: "user",
    means: "detached a sign-in provider",
  },
  {
    name: "identity_link_conflict",
    label: "link conflict",
    actor: "user",
    means: "that provider already belongs to another account",
  },
  {
    name: "signed_in",
    label: "signed in",
    actor: "user",
    means: "signed in with any provider",
  },
  {
    name: "account_created",
    label: "account created",
    actor: "user",
    means: "first-ever sign-in for this account",
  },
  {
    name: "vacancy_feedback",
    label: "vacancy feedback",
    actor: "user",
    means: "voted a job up or down",
  },
  {
    name: "bait_click",
    label: "bait click",
    actor: "user",
    means: "tapped an AI helper we have not built",
  },
  {
    name: "match_flow_completed",
    label: "match completed",
    actor: "user",
    means: "finished /match onboarding",
  },
  {
    name: "feed_score_locked",
    label: "score locked",
    actor: "user",
    means: "tapped the locked Fit slot on a cold /feed card",
  },
];

const BY_NAME = new Map(EVENT_CATALOG.map((event) => [event.name, event]));

export function findEvent(name: string): AnalyticsEventDoc | undefined {
  return BY_NAME.get(name);
}
