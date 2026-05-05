import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { nodes } from './nodes';

export const nodeAliases = pgTable(
  'node_aliases',
  {
    name: text('name').primaryKey(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('node_aliases_node_id_idx').on(t.nodeId)],
);

export type NodeAlias = typeof nodeAliases.$inferSelect;
export type NewNodeAlias = typeof nodeAliases.$inferInsert;
