import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

export const accountMergeRequests = pgTable(
  "account_merge_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceUserId: uuid("source_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    unique("account_merge_requests_code_hash_unique").on(t.codeHash),
    index("account_merge_requests_expires_at_idx").on(t.expiresAt),
  ],
);
