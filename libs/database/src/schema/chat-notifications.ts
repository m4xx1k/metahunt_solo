import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

import { vacancies } from "./vacancies";

// Alerts v2 ledger: one row per chat and posting, never per position, so a
// dedup regroup cannot cause a repeat. `version_at` is the last version the chat
// has seen; a send happens only when a newer one is claimed (ADR-0018).
export const chatNotifications = pgTable(
  "chat_notifications",
  {
    chatId: text("chat_id").notNull(),
    vacancyId: uuid("vacancy_id")
      .notNull()
      .references(() => vacancies.id),
    versionAt: timestamp("version_at", { withTimezone: true }).notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    kind: text("kind").notNull().$type<ChatNotificationKind>(),
    subscriptionId: uuid("subscription_id"),
    positionId: uuid("position_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.vacancyId] })],
);

export type ChatNotificationKind = "new" | "bumped" | "absorbed" | "collapsed";
export type ChatNotification = typeof chatNotifications.$inferSelect;
export type NewChatNotification = typeof chatNotifications.$inferInsert;
