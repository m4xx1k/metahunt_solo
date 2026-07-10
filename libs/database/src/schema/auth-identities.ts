import { pgTable, uuid, text, timestamp, unique, index } from "drizzle-orm/pg-core";

import { users } from "./users";

// One row per login method for a user. provider='telegram' now; 'email'|'google'
// later are just new rows — JWT, guard, and CV/subscription ownership all key on
// userId and don't change. username/firstName are a profile snapshot refreshed
// on each login, so /auth/me can render the account chip without another table.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("auth_identities_provider_user_key").on(t.provider, t.providerUserId),
    index("auth_identities_user_id_idx").on(t.userId),
  ],
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
