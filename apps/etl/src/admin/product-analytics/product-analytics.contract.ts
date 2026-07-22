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
