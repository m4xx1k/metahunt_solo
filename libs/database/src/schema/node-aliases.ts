import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { nodes, nodeType } from './nodes';

export const nodeAliases = pgTable(
  'node_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: nodeType('type').notNull(),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('node_aliases_name_type_key').on(t.name, t.type),
    index('node_aliases_node_id_idx').on(t.nodeId),
  ],
);

export type NodeAlias = typeof nodeAliases.$inferSelect;
export type NewNodeAlias = typeof nodeAliases.$inferInsert;
