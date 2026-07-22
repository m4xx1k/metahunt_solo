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

export interface SubscriberActivity {
  chatId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  joinedAt: string;
  firstSeenAt: string | null;
  ctaClickedAt: string | null;
  telegramLinkedAt: string | null;
  vacancyClicks: number;
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
