import { REPORTING_PERIODS, type ReportingPeriod } from "../../platform/shared/reporting-period";

export const PRODUCT_ANALYTICS_PERIODS = REPORTING_PERIODS;
export type ProductAnalyticsPeriod = ReportingPeriod;

export const CRM_PEOPLE_SORTS = ["recent", "first_known", "clicks", "at_risk"] as const;
export type CrmPeopleSort = (typeof CRM_PEOPLE_SORTS)[number];

export interface CrmPerson {
  id: string;
  displayName: string;
  hasAccount: boolean;
  hasTelegram: boolean;
  firstKnownAt: Date;
  lastProductActionAt: Date | null;
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
  createdAt: Date;
}

// Lifecycle per chat — the same rules the subscriberStates tiles aggregate:
// blocked = deactivated because the bot was cut off (block / unreachable),
// churned = the user unsubscribed everything, dormant = digests land but no
// user action for the dormancy window, active = the rest.
export type SubscriberStatus = "active" | "dormant" | "churned" | "blocked";

// One row per Telegram chat_id, summarizing that subscriber across all of their
// subscriptions (a subscriber may run more than one). `vacancyClicks` is
// digest-link taps, `feedClicks` is web feed taps — a SEPARATE measure, never
// merged. Both come from PostHog, keyed on the person, so a chat's two
// subscriptions cannot double-count one tap.
// `joinedAt` is the earliest subscription `created_at`; `telegramLinkedAt` is
// `subscriptions.linked_at`, the domain fact rather than an analytics echo of it.
// `lastActionAt` is the newest event a PERSON caused — deliberately not the
// digests we send, so a silent subscriber reads as silent.
export interface SubscriberActivity {
  chatId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  joinedAt: Date;
  telegramLinkedAt: Date | null;
  lastActionAt: Date | null;
  vacancyClicks: number;
  feedClicks: number;
  // First-touch referrer of this subscriber's person, folded into a channel
  // label. Null for anyone who arrived before the browser was unmuted.
  source: string | null;
  isActive: boolean;
  status: SubscriberStatus;
  subscriptions: SubscriberSubscription[];
}

// Subscriber lifecycle STATE per chat_id, all-time (not period-scoped).
// Dormant is the early-warning signal: digests are landing and nobody answers.
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

// System health, not user behavior: what OUR delivery pipeline did, counted from
// `sent_notifications`. `daily` is always the last 7 days, independent of the
// page's period selector.
export interface ProductDeliveryHealth {
  digestsSent: number;
  chatsReached: number;
  messagesPerChatPerDay: number;
  daily: ProductDeliveryDay[];
}

export interface ProductAnalyticsOverview {
  generatedAt: Date;
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
