import type { DrizzleDB, ProductEventSource } from "@metahunt/database";

export const PRODUCT_EVENT_WRITER = Symbol("PRODUCT_EVENT_WRITER");
export const ANALYTICS_OUTBOX_WRITER = Symbol("ANALYTICS_OUTBOX_WRITER");
export const ANALYTICS_SINK = Symbol("ANALYTICS_SINK");

export type AnalyticsExecutor = Pick<DrizzleDB, "insert">;

export interface ProductEventWrite {
  journeyId: string;
  subscriptionId?: string;
  name: string;
  source: ProductEventSource;
  dedupeKey: string;
  occurredAt?: Date;
  properties: Record<string, unknown>;
}

export interface ProductEventWriter {
  record(event: ProductEventWrite): Promise<void>;
  journeyForSubscription(subscriptionId: string): Promise<string | null>;
}

export interface AnalyticsOutboxWriter {
  enqueue(event: ProductEventWrite, executor?: AnalyticsExecutor): Promise<void>;
  drain(limit: number): Promise<ProductEventWrite[]>;
}

export interface AnalyticsSink {
  capture(distinctId: string, event: string, properties: Record<string, unknown>): void;
}
