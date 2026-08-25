import { apiGet, apiPatch, buildQs } from "./client";

export const PRODUCT_ANALYTICS_PERIODS = ["24h", "week", "30d", "all"] as const;
export type ProductAnalyticsPeriod = (typeof PRODUCT_ANALYTICS_PERIODS)[number];

export function isProductAnalyticsPeriod(value: string): value is ProductAnalyticsPeriod {
  return PRODUCT_ANALYTICS_PERIODS.some((period) => period === value);
}

export const PRODUCT_ANALYTICS_POPULATIONS = ["production", "test", "all"] as const;
export type ProductAnalyticsPopulation = (typeof PRODUCT_ANALYTICS_POPULATIONS)[number];

export function isProductAnalyticsPopulation(value: string): value is ProductAnalyticsPopulation {
  return PRODUCT_ANALYTICS_POPULATIONS.some((population) => population === value);
}

export interface ProductFunnelStep {
  name: string;
  events: number;
  journeys: number;
}

export interface ProductGrowthWeek {
  weekStart: string;
  linked: number;
  cumulative: number;
}

// The north star: newly linked chats per ISO week. `current`/`previous` are the
// last two weeks of the series — the week-over-week rate.
export interface ProductGrowth {
  weeks: ProductGrowthWeek[];
  current: number;
  previous: number;
  totalLinked: number;
}

// Grouped by the calendar week of the first link, but `returned[i]` counts a
// ROLLING 7-day window from each chat's own anchor. `size` is the denominator
// and must be rendered next to any percentage derived from it.
export interface ProductRetentionCohort {
  weekStart: string;
  size: number;
  returned: number[];
}

export interface ProductRetention {
  windowWeeks: number;
  cohorts: ProductRetentionCohort[];
}

export interface ProductAnalyticsOverview {
  generatedAt: string;
  period: ProductAnalyticsPeriod;
  population: ProductAnalyticsPopulation;
  growth: ProductGrowth;
  retention: ProductRetention;
  funnel: ProductFunnelStep[];
  // Journeys that hit a later step without ever landing (feed/warm subscribers)
  // — excluded from the anchored funnel, shown as a footnote instead.
  funnelBypass: number;
  subscriptions: {
    total: number;
    createdInPeriod: number;
    active: number;
    pending: number;
    linked: number;
    feed: number;
    cv: number;
    deactivated: number;
    delivered: number;
    linkedWithoutDelivery: number;
  };
  identity: {
    journeysTotal: number;
    browserJourneys: number;
    serverJourneys: number;
    legacyJourneys: number;
    accountLinkedJourneys: number;
    multiJourneyUsers: number;
    subscriptionsWithoutJourney: number;
    trackedLinkedWithoutEvent: number;
    trackedDeliveryWithoutEvent: number;
    multiSubscriptionJourneys: number;
    pendingOutboxEvents: number;
  };
  recentJourneys: Array<{
    id: string;
    origin: string;
    isTest: boolean;
    cohortId: string | null;
    createdAt: string;
    lastSeenAt: string;
    subscriptions: number;
    activeSubscriptions: number;
    linkedSubscriptions: number;
    deliveredSubscriptions: number;
    events: number;
    eventNames: string[];
    lastEventAt: string | null;
  }>;
  subscriberActivity: SubscriberActivity[];
  feedEngagement: ProductFeedEngagement;
  flow: ProductPeriodFlow;
  channels: ProductChannel[];
  subscriberStates: ProductSubscriberStates;
  delivery: ProductDeliveryHealth;
}

export const CRM_PEOPLE_SORTS = ["recent", "first_known", "clicks", "at_risk"] as const;
export type CrmPeopleSort = (typeof CRM_PEOPLE_SORTS)[number];

export interface CrmPerson {
  id: string;
  displayName: string;
  hasAccount: boolean;
  hasTelegram: boolean;
  firstKnownAt: string;
  lastProductActionAt: string | null;
  subscriptions: number;
  feedClicks: number;
  telegramClicks: number;
  state: "active" | "at_risk" | "no_subscription";
}

export interface CrmPeoplePage {
  metrics: { knownPeople: number; telegramConnected: number; jobClickers: number; atRisk: number };
  rows: CrmPerson[];
  total: number;
  offset: number;
  limit: number;
}

// Lifecycle STATE per chat, all-time — the headline churn numbers. Unlike
// `flow.churned` (unsubscribe events, one /stop can count several), these
// partition every linked chat exactly once.
export interface ProductSubscriberStates {
  active: number;
  dormant: number;
  churned: number;
}

export interface ProductDeliveryDay {
  date: string;
  digests: number;
  chats: number;
  perChat: number;
  failures: number;
}

// System health: what OUR pipeline sent, period-scoped; `daily` is a fixed
// 7-day drill-down independent of the period selector.
export interface ProductDeliveryHealth {
  digestsSent: number;
  chatsReached: number;
  messagesPerChatPerDay: number;
  unsubscribed: number;
  daily: ProductDeliveryDay[];
}

export interface ProductFeedEngagement {
  journeys: number;
  events: number;
}

// Period-scoped movement: every number answers "what happened in the selected
// window", unlike the all-time state in `subscriptions`.
export interface ProductPeriodFlow {
  joined: number;
  activated: number;
  digestClicks: number;
  feedClicks: number;
  churned: number;
}

// First-touch acquisition. `source: null` = arrived without a utm_source
// (direct, organic, or a link that dropped the params).
export interface ProductChannel {
  // Always a label, never null: utm_source when tagged, else the referrer
  // folded into a channel, else "direct".
  source: string;
  // First-touch utm_campaign — one row per (source, campaign) = one row per post.
  campaign: string | null;
  landed: number;
  subscribed: number;
  activated: number;
  digestClicks: number;
}

export interface AnalyticsJourneyClassification {
  id: string;
  isTest: boolean;
  cohortId: string | null;
}

export interface SubscriberSubscription {
  id: string;
  isActive: boolean;
  isCv: boolean;
  trackLabel: string;
  createdAt: string;
}

// Lifecycle per chat, same rules as the subscriberStates tiles. blocked =
// the bot was cut off (block / bounced sends), churned = unsubscribed
// everything, dormant = digests land but no user action in the window.
export type SubscriberStatus = "active" | "dormant" | "churned" | "blocked";

// `lastActionAt` is the newest event the subscriber themselves caused — the
// digests we send at them are deliberately excluded, so silence reads as silence.
export interface SubscriberActivity {
  chatId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  joinedAt: string;
  firstSeenAt: string | null;
  ctaClickedAt: string | null;
  telegramLinkedAt: string | null;
  lastActionAt: string | null;
  vacancyClicks: number;
  feedClicks: number;
  // First-touch channel of this subscriber's journey. Null when the journey has
  // no landing event at all (feed/warm entry, or older than the ledger).
  source: string | null;
  isActive: boolean;
  status: SubscriberStatus;
  subscriptions: SubscriberSubscription[];
}

export const productAnalyticsApi = {
  overview: (period: ProductAnalyticsPeriod, population: ProductAnalyticsPopulation) =>
    apiGet<ProductAnalyticsOverview>(
      `/admin/product-analytics/overview${buildQs({ period, population })}`,
    ),
  people: (input: {
    period: ProductAnalyticsPeriod;
    q?: string;
    sort?: CrmPeopleSort;
    offset?: number;
    from?: string;
    to?: string;
  }) => apiGet<CrmPeoplePage>(`/admin/product-analytics/people${buildQs(input)}`),
  updateJourney: (id: string, input: { isTest: boolean; cohortId?: string | null }) =>
    apiPatch<AnalyticsJourneyClassification>(`/admin/product-analytics/journeys/${id}`, input),
};
