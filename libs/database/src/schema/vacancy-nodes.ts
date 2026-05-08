import { pgTable, uuid, boolean, primaryKey, index } from 'drizzle-orm/pg-core';
import { vacancies } from './vacancies';
import { nodes } from './nodes';

export const vacancyNodes = pgTable(
  'vacancy_nodes',
  {
    vacancyId: uuid('vacancy_id')
      .notNull()
      .references(() => vacancies.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id),
    isRequired: boolean('is_required').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.vacancyId, t.nodeId] }),
    index('vacancy_nodes_node_id_idx').on(t.nodeId),
  ],
);

export type VacancyNode = typeof vacancyNodes.$inferSelect;
export type NewVacancyNode = typeof vacancyNodes.$inferInsert;
