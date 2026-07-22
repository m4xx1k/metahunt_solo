import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { analyticsJourneys } from "./analytics-journeys";
import type { ProductEventSource } from "./product-events";
import { subscriptions } from "./subscriptions";

// Transactional hand-off between product mutations and the analytics ledger.
// Feature transactions enqueue here; a retrying dispatcher copies each row to
// product_events and only then marks it processed.
export const analyticsOutbox = pgTable(
  "analytics_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journeyId: uuid("journey_id")
      .notNull()
      .references(() => analyticsJourneys.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    source: text("source").notNull().$type<ProductEventSource>(),
    dedupeKey: text("dedupe_key").notNull(),
    properties: jsonb("properties").notNull().$type<Record<string, unknown>>().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    unique("analytics_outbox_dedupe_key_unique").on(t.dedupeKey),
    index("analytics_outbox_pending_idx").on(t.processedAt, t.createdAt),
  ],
);

export type AnalyticsOutboxEvent = typeof analyticsOutbox.$inferSelect;
export type NewAnalyticsOutboxEvent = typeof analyticsOutbox.$inferInsert;
