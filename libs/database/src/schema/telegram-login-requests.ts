import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

import { users } from "./users";

// One row per "log in with Telegram" attempt (the bot deep-link flow).
// `nonce` travels through the `t.me/<bot>?start=login_<nonce>` URL; the poll
// secret never does, so observing the link is not enough to claim the session.
// `verification_code` is shown in the browser and echoed by the bot, so someone
// handed a forwarded link can tell it isn't theirs. Single-use via `consumed_at`.
export const telegramLoginRequests = pgTable(
  "telegram_login_requests",
  {
    nonce: text("nonce").primaryKey(),
    pollSecretHash: text("poll_secret_hash").notNull(),
    verificationCode: text("verification_code").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    // Carried from the bot's upsert so the browser can emit `signup` exactly once.
    isNewUser: boolean("is_new_user").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("telegram_login_requests_expires_at_idx").on(t.expiresAt)],
);

export type TelegramLoginRequest = typeof telegramLoginRequests.$inferSelect;
export type NewTelegramLoginRequest = typeof telegramLoginRequests.$inferInsert;
