export const ANALYTICS_PAGE_PERIODS = ["24h", "7d", "30d", "90d"] as const;
export type AnalyticsPagePeriod = (typeof ANALYTICS_PAGE_PERIODS)[number];

export interface AnalyticsPageActiveUsers {
  dau: number;
  wau: number;
  mau: number;
}

// Step-presence funnel (not ordered — see spec): "people" counts distinct
// PostHog persons who fired that event at all within the window.
// `conversionFromPrev` is null for the first step, which has no predecessor.
export interface AnalyticsPageFunnelStep {
  step: string;
  label: string;
  people: number;
  conversionFromPrev: number | null;
}

export interface AnalyticsPageSource {
  source: string;
  people: number;
}

export interface AnalyticsPageMetrics {
  // False when the PostHog personal API key/host/project are unset (or
  // malformed) — every other field is a zeroed default in that case, never
  // an error.
  available: boolean;
  behaviorStatus: "unconfigured" | "denied" | "unavailable" | "empty" | "ready";
  activeUsers: AnalyticsPageActiveUsers;
  funnel: AnalyticsPageFunnelStep[];
  // landing_cta_clicked people — shown beside the funnel, not inside it (see
  // spec: fewer people hit this than reach the form, so it's not a gate).
  ctaClicks: number;
  sources: AnalyticsPageSource[];
}

export const ANALYTICS_PAGE_PEOPLE_SORTS = [
  "registeredAt",
  "displayName",
  "subscriptions",
  "activeSubscriptions",
  "firstSubscriptionAt",
] as const;
export type AnalyticsPagePeopleSort = (typeof ANALYTICS_PAGE_PEOPLE_SORTS)[number];

export const ANALYTICS_PAGE_PEOPLE_DIRECTIONS = ["asc", "desc"] as const;
export type AnalyticsPagePeopleDirection = (typeof ANALYTICS_PAGE_PEOPLE_DIRECTIONS)[number];

export interface AnalyticsPagePerson {
  // Contacts is an account roster. This is always users.id, never a PostHog
  // person_id or an anonymous browser/journey id.
  userId: string;
  displayName: string;
  email: string | null;
  telegramUsername: string | null;
  providers: string[];
  registeredAt: string | null;
  subscriptions: number;
  activeSubscriptions: number;
  firstSubscriptionAt: string | null;
  telegramLinked: boolean;
  subscriptionDetails: Array<{
    id: string;
    name: string | null;
    params: Record<string, unknown>;
    isActive: boolean;
    createdAt: string | null;
  }>;
  // PostHog side — null when the query client is unavailable.
  firstEventAt: string | null;
  lastEventAt: string | null;
  pageviews: number | null;
  feedClicks: number | null;
  digestClicks: number | null;
  lastAction: string | null;
  // Derived, null when either side is missing OR the computed value would be
  // negative (a merged/reassigned person id) — never rendered as negative.
  minutesToRegistration: number | null;
  minutesToSubscription: number | null;
}

export interface AnalyticsPagePeoplePage {
  total: number;
  rows: AnalyticsPagePerson[];
}

export interface AnalyticsPagePeopleQuery {
  period: AnalyticsPagePeriod;
  source?: string;
  limit: number;
  offset: number;
  sort: AnalyticsPagePeopleSort;
  dir: AnalyticsPagePeopleDirection;
  q?: string;
}
