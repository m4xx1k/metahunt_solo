import { pgTable, uuid, text, jsonb, integer, timestamp, index, unique } from "drizzle-orm/pg-core";

import { analyticsJourneys } from "./analytics-journeys";
import { subscriptions } from "./subscriptions";

export const PRODUCT_EVENT_SOURCES = ["browser", "api", "telegram", "worker"] as const;
export type ProductEventSource = (typeof PRODUCT_EVENT_SOURCES)[number];

// Durable proof for the critical activation and delivery events. PostHog stays
// an analysis sink; correctness is independently queryable from this ledger.
export const productEvents = pgTable(
  "product_events",
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
    schemaVersion: integer("schema_version").notNull().default(1),
    dedupeKey: text("dedupe_key").notNull(),
    properties: jsonb("properties").notNull().$type<Record<string, unknown>>().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("product_events_dedupe_key_unique").on(t.dedupeKey),
    index("product_events_journey_occurred_idx").on(t.journeyId, t.occurredAt),
    index("product_events_subscription_occurred_idx").on(t.subscriptionId, t.occurredAt),
    index("product_events_name_occurred_idx").on(t.name, t.occurredAt),
  ],
);

export type ProductEvent = typeof productEvents.$inferSelect;
export type NewProductEvent = typeof productEvents.$inferInsert;
