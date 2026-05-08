import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';

export const nodeType = pgEnum('node_type', ['ROLE', 'SKILL', 'DOMAIN']);
export const nodeStatus = pgEnum('node_status', ['NEW', 'VERIFIED', 'HIDDEN']);

export const nodes = pgTable(
  'nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: nodeType('type').notNull(),
    canonicalName: text('canonical_name').notNull(),
    status: nodeStatus('status').notNull().default('NEW'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('nodes_type_canonical_name_key').on(t.type, t.canonicalName),
    index('nodes_status_type_idx').on(t.status, t.type),
  ],
);

export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
