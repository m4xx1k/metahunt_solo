import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";
import { vacancies } from "./vacancies";

// Operator verdicts the dedup rebuild must respect: a `different` pair can
// never share a position, whatever the rules say. One row per unordered pair.
export const dedupOverrides = pgTable(
  "dedup_overrides",
  {
    vacancyA: uuid("vacancy_a")
      .notNull()
      .references(() => vacancies.id, { onDelete: "cascade" }),
    vacancyB: uuid("vacancy_b")
      .notNull()
      .references(() => vacancies.id, { onDelete: "cascade" }),
    verdict: text("verdict").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    primaryKey({ columns: [t.vacancyA, t.vacancyB] }),
    check("dedup_overrides_ordered_pair", sql`${t.vacancyA} < ${t.vacancyB}`),
    check("dedup_overrides_verdict", sql`${t.verdict} = 'different'`),
  ],
);

export type DedupOverride = typeof dedupOverrides.$inferSelect;
