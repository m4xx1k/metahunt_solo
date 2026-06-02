import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  primaryKey,
  unique,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { nodes } from './nodes';

// The single user-facing browse tree. ~12 disciplines (parent_id NULL) plus
// ~40 stack children (parent_id → their discipline), depth 2 only. This table
// is the ONLY place organizational hierarchy lives — `nodes` stays flat. See
// md/journal/migrations/taxonomy-navigation.md for the full model.
export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    // Disciplines are NULL; stack children point at their discipline. Self-ref
    // on a tiny curated table — the cycle/recursion worry we kept off `nodes`.
    parentId: uuid('parent_id').references((): AnyPgColumn => tracks.id),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    unique('tracks_slug_key').on(t.slug),
    index('tracks_parent_id_idx').on(t.parentId),
    check('tracks_parent_not_self', sql`${t.parentId} <> ${t.id}`),
  ],
);

// Each track's OWN criteria; the axis is decided by the referenced node.type —
// a ROLE ref filters vacancies.role_node_id, a SKILL ref filters via
// vacancy_nodes. No axis enum: node.type already encodes it.
export const trackNodes = pgTable(
  'track_nodes',
  {
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.trackId, t.nodeId] }),
    index('track_nodes_node_id_idx').on(t.nodeId),
  ],
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type TrackNode = typeof trackNodes.$inferSelect;
export type NewTrackNode = typeof trackNodes.$inferInsert;
