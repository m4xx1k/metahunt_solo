import type { DrizzleDB, ProductEventSource } from "@metahunt/database";

import type { SubscriptionKind } from "./analytics.types";

export const PRODUCT_EVENT_WRITER = Symbol("PRODUCT_EVENT_WRITER");
export const ANALYTICS_OUTBOX_WRITER = Symbol("ANALYTICS_OUTBOX_WRITER");
export const ANALYTICS_SINK = Symbol("ANALYTICS_SINK");

export type AnalyticsExecutor = Pick<DrizzleDB, "insert">;

export interface ProductEventWrite {
  journeyId: string;
  personId?: string;
  isTest?: boolean;
  subscriptionId?: string;
  name: string;
  source: ProductEventSource;
  dedupeKey: string;
  occurredAt?: Date;
  properties: Record<string, unknown>;
}

// The identity of a subscriber: `subscriptions.person_id`. Every subscription
// has one from birth, and claiming an account rewrites it to `users.id` — so a
// Telegram-only subscriber is a person on day one, not on the day they sign in.
export interface SubscriberIdentity {
  personId: string;
  subscriptionKind: SubscriptionKind;
}

export interface ProductEventWriter {
  record(event: ProductEventWrite): Promise<void>;
  journeyForSubscription(subscriptionId: string): Promise<string | null>;
  personForJourney(journeyId: string): Promise<string | null>;
  subscriberForSubscription(subscriptionId: string): Promise<SubscriberIdentity | null>;
  subscriberForJourney(journeyId: string): Promise<SubscriberIdentity | null>;
}

export interface AnalyticsOutboxWriter {
  enqueue(event: ProductEventWrite, executor?: AnalyticsExecutor): Promise<void>;
  drain(limit: number): Promise<ProductEventWrite[]>;
}

export interface AnalyticsSink {
  capture(distinctId: string, event: string, properties: Record<string, unknown>): void;
  alias(distinctId: string, alias: string): void;
}
