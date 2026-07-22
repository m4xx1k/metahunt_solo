import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const ANALYTICS_JOURNEY_ORIGINS = ["browser", "server", "legacy_subscription"] as const;
export type AnalyticsJourneyOrigin = (typeof ANALYTICS_JOURNEY_ORIGINS)[number];

// Pseudonymous correlation across browser, subscription, Telegram, and worker.
// It is never an authorization credential and stores no Telegram profile data.
export const analyticsJourneys = pgTable(
  "analytics_journeys",
  {
    id: uuid("id").primaryKey(),
    origin: text("origin").notNull().default("browser").$type<AnalyticsJourneyOrigin>(),
    isTest: boolean("is_test").notNull().default(false),
    cohortId: text("cohort_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_journeys_created_at_idx").on(t.createdAt)],
);

export type AnalyticsJourney = typeof analyticsJourneys.$inferSelect;
export type NewAnalyticsJourney = typeof analyticsJourneys.$inferInsert;
