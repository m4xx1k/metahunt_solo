import { pgTable, uuid, boolean, smallint, primaryKey, index } from "drizzle-orm/pg-core";

import { nodes } from "./nodes";
import { vacancies } from "./vacancies";

export const vacancyNodes = pgTable(
  "vacancy_nodes",
  {
    vacancyId: uuid("vacancy_id")
      .notNull()
      .references(() => vacancies.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id),
    isRequired: boolean("is_required").notNull().default(true),
    // NULL = a standalone requirement; a shared number = one "A or B" choice.
    requirementGroup: smallint("requirement_group"),
  },
  (t) => [
    primaryKey({ columns: [t.vacancyId, t.nodeId] }),
    index("vacancy_nodes_node_id_idx").on(t.nodeId),
  ],
);

export type VacancyNode = typeof vacancyNodes.$inferSelect;
export type NewVacancyNode = typeof vacancyNodes.$inferInsert;
