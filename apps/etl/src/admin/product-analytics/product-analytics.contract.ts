import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

import { ANALYTICS_EVENTS } from "../../platform/analytics/events";
import { REPORTING_PERIODS, type ReportingPeriod } from "../../platform/shared/reporting-period";

export const PRODUCT_ANALYTICS_PERIODS = REPORTING_PERIODS;
export type ProductAnalyticsPeriod = ReportingPeriod;

export const PRODUCT_ANALYTICS_POPULATIONS = ["production", "test", "all"] as const;
export type ProductAnalyticsPopulation = (typeof PRODUCT_ANALYTICS_POPULATIONS)[number];

export const MAX_ANALYTICS_COHORT_ID_LENGTH = 64;

export class UpdateAnalyticsJourneyDto {
  @IsBoolean()
  isTest!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ANALYTICS_COHORT_ID_LENGTH)
  cohortId?: string | null;
}

export const PRODUCT_FUNNEL_STEPS = [
  ANALYTICS_EVENTS.landingView,
  ANALYTICS_EVENTS.landingCtaClicked,
  ANALYTICS_EVENTS.subscriptionCreateStarted,
  ANALYTICS_EVENTS.subscriptionCreated,
  ANALYTICS_EVENTS.subscriptionHandoffOpened,
  ANALYTICS_EVENTS.telegramLinked,
  ANALYTICS_EVENTS.activationValueShown,
  ANALYTICS_EVENTS.digestSent,
  ANALYTICS_EVENTS.digestLinkClicked,
] as const;

export type ProductFunnelStep = (typeof PRODUCT_FUNNEL_STEPS)[number];

export interface ProductAnalyticsOverview {
  generatedAt: Date;
  period: ProductAnalyticsPeriod;
  population: ProductAnalyticsPopulation;
  funnel: Array<{ name: ProductFunnelStep; events: number; journeys: number }>;
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
  identity: ProductIdentityHealth;
  recentJourneys: RecentProductJourney[];
  subscriberActivity: SubscriberActivity[];
}

export interface ProductIdentityHealth {
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
}

export interface RecentProductJourney {
  id: string;
  origin: string;
  isTest: boolean;
  cohortId: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  subscriptions: number;
  activeSubscriptions: number;
  linkedSubscriptions: number;
  deliveredSubscriptions: number;
  events: number;
  eventNames: string[];
  lastEventAt: Date | null;
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
  createdAt: Date;
}

// One row per Telegram chat_id, summarizing that subscriber's whole funnel
// journey across all of their subscriptions (a subscriber may run more than
// one). `vacancyClicks` is digest-link taps only — feed-card taps are logged
// anonymously (no subscription_id) and aren't attributable per subscriber yet.
// `joinedAt` is the earliest subscription `created_at` — the truthful "first
// touch," unlike `firstSeenAt` which only reflects the analytics ledger (live
// since this feature's own deploy, so it understates age for older subscribers).
export interface SubscriberActivity {
  chatId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  joinedAt: Date;
  firstSeenAt: Date | null;
  ctaClickedAt: Date | null;
  telegramLinkedAt: Date | null;
  vacancyClicks: number;
  subscriptions: SubscriberSubscription[];
}
