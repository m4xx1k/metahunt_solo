// The one server-side event registry. Two lists mirror it and are kept honest
// by `pnpm analytics:catalog`: the browser's names in
// apps/web/lib/analytics/use-analytics.ts (apps/web has no workspace
// dependencies, so it cannot import this file) and the console's catalog in
// apps/web/entities/analytics/event-catalog.ts.

// What PostHog receives. Deliberately small: one verb per act, each one a fact
// no outsider watching URLs and clicks could infer.
export const PRODUCT_ANALYTICS_EVENTS = [
  "$pageview",
  "account_created",
  "signed_in",
  "subscription_created",
  "telegram_linked",
  "digest_sent",
  "vacancy_outbound_clicked",
  "subscription_deactivated",
] as const;

export type ProductAnalyticsEvent = (typeof PRODUCT_ANALYTICS_EVENTS)[number];

// The two verbs no domain service can name a person for, so they are captured
// here rather than through `PostHogClient`'s typed methods.
export const ANALYTICS_EVENTS = {
  // A /go tap carrying neither a referring subscription (`?s=`) nor a browser
  // journey (`?j=`). Its own name so `vacancy_outbound_clicked` can mean "a
  // click we can attribute" without a filter anyone has to remember — the
  // unattributed volume is ~97% of /go taps and would otherwise drown it.
  vacancyOutboundUnattributed: "vacancy_outbound_unattributed",
  matchScored: "match_scored",
} as const;
