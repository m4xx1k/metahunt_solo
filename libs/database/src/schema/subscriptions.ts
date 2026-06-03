import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// A subscription = a saved vacancy filter (the params the catalog `list()`
// already consumes) plus the Telegram chat to deliver digests to.
//
// `id` doubles as the deep-link token (`t.me/<bot>?start=<id>`) and is the
// canonical subscriber identity we hang future channels/auth off — never key
// on `chat_id`. It starts unlinked (`chat_id` null, `is_active` false) at web
// "Subscribe"; `/start <id>` links the chat and activates it.
//
// `params` is jsonb so the filter shape can evolve without a migration; it is a
// stored-JSON boundary, validated when read back.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chatId: text('chat_id'),
    params: jsonb('params').notNull().$type<Record<string, unknown>>(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('subscriptions_chat_id_idx').on(t.chatId)],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
