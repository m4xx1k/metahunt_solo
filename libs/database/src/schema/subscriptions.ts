import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";

import { analyticsJourneys } from "./analytics-journeys";
import { users } from "./users";

// A saved vacancy query + the Telegram chat to deliver digests to. `id` is the
// deep-link token (`?start=<id>`) and the subscriber identity — never key on
// `chat_id`. `candidate_id` set → CV sub (digest ranks via rankByRefs); null →
// feed-filter sub. `params` is jsonb so the filter shape can evolve. `user_id`
// is set once a subscription is claimed by a logged-in user; legacy chat-only
// rows stay null.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: text("chat_id"),
    candidateId: text("candidate_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id").references(() => analyticsJourneys.id, {
      onDelete: "set null",
    }),
    params: jsonb("params").notNull().$type<Record<string, unknown>>(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [
    index("subscriptions_chat_id_idx").on(t.chatId),
    index("subscriptions_user_id_idx").on(t.userId),
    index("subscriptions_journey_id_idx").on(t.journeyId),
    index("subscriptions_created_at_idx").on(t.createdAt),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
