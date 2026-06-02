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
  pgView,
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

// Per-track eligible-vacancy count, computed so a track's displayed number
// equals exactly what clicking it returns (per-axis override-else-inherit):
// effective ROLE/SKILL = the track's OWN nodes of that type, or — if it has
// none — its parent's (one hop). A track with no effective criteria on either
// axis (pure-grouping parent like "By Language") counts 0; the feed's VERIFIED
// eligibility is mirrored so the count never overstates a click. Counts are
// per-track independent (child ⊆ parent overlaps) — never sum them to a total.
// Plain VIEW for now; materialize + refresh post-ingest only if it gets slow.
export const trackCounts = pgView('track_counts', {
  trackId: uuid('track_id'),
  slug: text('slug'),
  vacancyCount: integer('vacancy_count'),
}).as(
  sql`
    WITH own AS (
      SELECT tn.track_id,
             array_agg(tn.node_id) FILTER (WHERE n.type = 'ROLE')  AS role_ids,
             array_agg(tn.node_id) FILTER (WHERE n.type = 'SKILL') AS skill_ids
      FROM track_nodes tn
      JOIN nodes n ON n.id = tn.node_id
      GROUP BY tn.track_id
    ),
    eff AS (
      SELECT t.id AS track_id, t.slug,
             COALESCE(o.role_ids,  po.role_ids)  AS role_ids,
             COALESCE(o.skill_ids, po.skill_ids) AS skill_ids
      FROM tracks t
      LEFT JOIN own o  ON o.track_id  = t.id
      LEFT JOIN own po ON po.track_id = t.parent_id
    )
    SELECT e.track_id, e.slug,
      CASE
        WHEN e.role_ids IS NULL AND e.skill_ids IS NULL THEN 0
        ELSE (
          SELECT count(*)
          FROM vacancies v
          JOIN nodes rn ON rn.id = v.role_node_id AND rn.status = 'VERIFIED'
          WHERE (e.role_ids IS NULL OR v.role_node_id = ANY(e.role_ids))
            AND (e.skill_ids IS NULL OR EXISTS (
                  SELECT 1 FROM vacancy_nodes vn
                  WHERE vn.vacancy_id = v.id AND vn.node_id = ANY(e.skill_ids)))
        )
      END AS vacancy_count
    FROM eff e
  `,
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type TrackNode = typeof trackNodes.$inferSelect;
export type NewTrackNode = typeof trackNodes.$inferInsert;
