import { apiGet, buildQs } from "./client";

export const PRODUCT_ANALYTICS_PERIODS = ["24h", "week", "30d", "all"] as const;
export type ProductAnalyticsPeriod = (typeof PRODUCT_ANALYTICS_PERIODS)[number];

export function isProductAnalyticsPeriod(value: string): value is ProductAnalyticsPeriod {
  return PRODUCT_ANALYTICS_PERIODS.some((period) => period === value);
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
  telegramLinkedAt: string | null;
  lastActionAt: string | null;
  vacancyClicks: number;
  feedClicks: number;
  // First-touch referrer of this subscriber's person. Null for anyone who
  // arrived before the browser was unmuted.
  source: string | null;
  isActive: boolean;
  status: SubscriberStatus;
  subscriptions: SubscriberSubscription[];
}

// Subscriber lifecycle STATE per chat, all-time. Dormant is the early-warning
// signal for churn: digests are landing and nobody answers.
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
}

// System health, not user behavior: what OUR delivery pipeline did. `daily` is
// always the last 7 days, independent of the page's period selector.
export interface ProductDeliveryHealth {
  digestsSent: number;
  chatsReached: number;
  messagesPerChatPerDay: number;
  daily: ProductDeliveryDay[];
}

export interface ProductAnalyticsOverview {
  generatedAt: string;
  period: ProductAnalyticsPeriod;
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
  subscriberActivity: SubscriberActivity[];
  subscriberStates: ProductSubscriberStates;
  delivery: ProductDeliveryHealth;
}

export const productAnalyticsApi = {
  overview: (period: ProductAnalyticsPeriod) =>
    apiGet<ProductAnalyticsOverview>(`/admin/product-analytics/overview${buildQs({ period })}`),
  people: (input: {
    period: ProductAnalyticsPeriod;
    q?: string;
    sort?: CrmPeopleSort;
    offset?: number;
    from?: string;
    to?: string;
  }) => apiGet<CrmPeoplePage>(`/admin/product-analytics/people${buildQs(input)}`),
};
