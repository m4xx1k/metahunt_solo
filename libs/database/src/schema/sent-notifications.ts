import { pgTable, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";

import { subscriptions } from "./subscriptions";
import { vacancies } from "./vacancies";

// Source of truth for "already sent". The composite PK makes a double-send
// impossible even under retry, and the anti-join against this table — not a
// stored `since` watermark — is what gives matching its correctness.
export const sentNotifications = pgTable(
  "sent_notifications",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    vacancyId: uuid("vacancy_id")
      .notNull()
      .references(() => vacancies.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.subscriptionId, t.vacancyId] })],
);

export type SentNotification = typeof sentNotifications.$inferSelect;
export type NewSentNotification = typeof sentNotifications.$inferInsert;
