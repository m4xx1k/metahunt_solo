import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

// Canonical person. Began as a waitlist table (email + source) and is now also
// the auth identity target. email is nullable (Telegram logins have none);
// login methods live in auth_identities. roles gate admin-only API routes.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  source: text("source").notNull(),
  roles: text("roles").array().notNull().default(["user"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
