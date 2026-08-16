// Types and fetchers for the live PostHog + Postgres analytics-page API.

import { apiGet, buildQs } from "./client";

export const ANALYTICS_PAGE_PERIODS = ["24h", "7d", "30d", "90d"] as const;
export type AnalyticsPagePeriod = (typeof ANALYTICS_PAGE_PERIODS)[number];

export const ANALYTICS_PAGE_PEOPLE_SORTS = [
  "registeredAt",
  "displayName",
  "subscriptions",
  "activeSubscriptions",
  "firstSubscriptionAt",
] as const;
export type AnalyticsPagePeopleSort = (typeof ANALYTICS_PAGE_PEOPLE_SORTS)[number];

export function isAnalyticsPagePeriod(value: string): value is AnalyticsPagePeriod {
  return ANALYTICS_PAGE_PERIODS.some((period) => period === value);
}

export function isAnalyticsPagePeopleSort(value: string): value is AnalyticsPagePeopleSort {
  return ANALYTICS_PAGE_PEOPLE_SORTS.some((sort) => sort === value);
}

export interface AnalyticsPageActiveUsers {
  dau: number;
  wau: number;
  mau: number;
}

// A step-presence funnel, not an ordered one: subscription_created can arrive
// from the bot without a web form, so steps count "fired this event", not
// "completed the previous step".
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
  // false when POSTHOG_PERSONAL_API_KEY (or the other two PostHog query vars)
  // is unset on the ETL — render the explanatory empty state, never an error.
  available: boolean;
  behaviorStatus: "unconfigured" | "denied" | "unavailable" | "empty" | "ready";
  activeUsers: AnalyticsPageActiveUsers;
  funnel: AnalyticsPageFunnelStep[];
  // landing_cta_clicked people — deliberately outside `funnel`: fewer people
  // fire it than reach the form, so gating on it would undercount.
  ctaClicks: number;
  sources: AnalyticsPageSource[];
}

export interface AnalyticsPagePerson {
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
  /** Us, not a user — from users.roles, the same source PostHog's is_staff reads. */
  isStaff: boolean;
  // PostHog side — null when the personal API key is unavailable.
  firstEventAt: string | null;
  lastEventAt: string | null;
  pageviews: number | null;
  feedClicks: number | null;
  digestClicks: number | null;
  lastAction: string | null;
  // Derived; null when either side is missing, and always >= 0 (a negative
  // value would mean the person id was reassigned by a merge).
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
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: "asc" | "desc";
  q?: string;
}

export const analyticsPageApi = {
  metrics: (input: { period: AnalyticsPagePeriod; source?: string }) =>
    apiGet<AnalyticsPageMetrics>(`/admin/analytics-page/metrics${buildQs(input)}`),
  people: (input: AnalyticsPagePeopleQuery) =>
    apiGet<AnalyticsPagePeoplePage>(`/admin/analytics-page/people${buildQs(input)}`),
};
