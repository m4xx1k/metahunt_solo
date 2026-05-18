import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

// Waitlist signup target. Email is the natural key; `source` records where
// the signup came from (e.g. 'landing-cta') so we can attribute conversion.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
