import { pgTable, uuid, text, timestamp, unique, index } from "drizzle-orm/pg-core";

import { users } from "./users";

// One row per login method for a user. JWT, guard, and CV/subscription ownership
// all key on userId, so a new provider is a new row and nothing else.
// username/firstName/email are a profile snapshot refreshed on each login, so
// /auth/me renders the account chip without another table.
//
// The provider's email lives HERE, never on `users`. `users.email` means one
// thing — a waitlist signup — which is what makes it safe for a verified Google
// address to adopt such a row: a row with no identity has no owner yet.
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("auth_identities_provider_user_key").on(t.provider, t.providerUserId),
    // One identity per provider per account, so "unlink google" can never mean
    // "delete two rows" and strand someone with no way back in.
    unique("auth_identities_user_provider_key").on(t.userId, t.provider),
    index("auth_identities_user_id_idx").on(t.userId),
  ],
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
