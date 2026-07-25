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

export interface ProductAnalyticsOverview {
  generatedAt: string;
  period: ProductAnalyticsPeriod;
  population: ProductAnalyticsPopulation;
  funnel: ProductFunnelStep[];
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
  failures: { chatUnreachable: number; transient: number };
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
  source: string | null;
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
  isActive: boolean;
  subscriptions: SubscriberSubscription[];
}

export const productAnalyticsApi = {
  overview: (period: ProductAnalyticsPeriod, population: ProductAnalyticsPopulation) =>
    apiGet<ProductAnalyticsOverview>(
      `/admin/product-analytics/overview${buildQs({ period, population })}`,
    ),
  updateJourney: (id: string, input: { isTest: boolean; cohortId?: string | null }) =>
    apiPatch<AnalyticsJourneyClassification>(`/admin/product-analytics/journeys/${id}`, input),
};
