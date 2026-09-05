import { sql } from "drizzle-orm";
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
} from "drizzle-orm/pg-core";

import { nodes } from "./nodes";

// The single user-facing browse tree. ~12 disciplines (parent_id NULL) plus
// ~40 stack children (parent_id → their discipline), depth 2 only. This table
// is the ONLY place organizational hierarchy lives — `nodes` stays flat. See
// md/journal/migrations/taxonomy-navigation.md for the full model.
export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    // Disciplines are NULL; stack children point at their discipline. Self-ref
    // on a tiny curated table — the cycle/recursion worry we kept off `nodes`.
    parentId: uuid("parent_id").references((): AnyPgColumn => tracks.id),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    unique("tracks_slug_key").on(t.slug),
    index("tracks_parent_id_idx").on(t.parentId),
    check("tracks_parent_not_self", sql`${t.parentId} <> ${t.id}`),
  ],
);

// Each track's OWN preset nodes; the axis is decided by the referenced node.type —
// a ROLE ref filters vacancies.role_node_id, a SKILL ref filters via
// vacancy_nodes. No axis enum: node.type already encodes it.
export const trackNodes = pgTable(
  "track_nodes",
  {
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.trackId, t.nodeId] }),
    index("track_nodes_node_id_idx").on(t.nodeId),
  ],
);

// Per-track eligible-Position count. Effective ROLE/SKILL is override-else-
// inherit (own nodes, else the parent's — one hop); a pure-grouping track with
// neither counts 0. Counts overlap (child ⊆ parent) — never sum them.
//
// The skill predicate mirrors the feed's default filter, `is_required` only, so
// the badge predicts the click (MET-141: counting optional links too made
// backend-go read 304 against 222 on click). Second, narrower gap left open on
// purpose: a track matches ANY of its skills, the feed's `skillIds` requires
// ALL — identical while every track carries at most one skill.
export const trackCounts = pgView("track_counts", {
  trackId: uuid("track_id"),
  slug: text("slug"),
  vacancyCount: integer("vacancy_count"),
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
          FROM positions p
          WHERE p.role_node_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM nodes rn WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED')
            AND (e.role_ids IS NULL OR p.role_node_id = ANY(e.role_ids))
            AND (e.skill_ids IS NULL OR EXISTS (
                  SELECT 1 FROM position_nodes pn
                  WHERE pn.position_id = p.position_id
                    AND pn.node_id = ANY(e.skill_ids)
                    AND pn.is_required))
        )
      END AS vacancy_count
    FROM eff e
  `,
);

// Per-track, per-node document frequency for the taxonomy curation map (see
// md/journal/migrations/taxonomy-kind-map.md). Unlike `track_counts` (one row
// per track), this is one row per (track, skill node) pair — `df` counted
// within that track only, which is what sizes a tile on the map. Covers all
// 55 tracks (disciplines and their children), not just disciplines: hardware
// vs hw-embedded vs hw-hardware are genuinely different skill populations.
// Track resolution mirrors `track_counts` exactly (own preset nodes, else the
// parent's, role must be VERIFIED). Plain view — measured on prod at 1.1s for
// 28,931 rows; materialize only if the page is visibly slow.
export const trackNodeStats = pgView("track_node_stats", {
  trackSlug: text("track_slug"),
  nodeId: uuid("node_id"),
  df: integer("df"),
}).as(
  sql`
    WITH own AS (
      SELECT tn.track_id,
             array_agg(tn.node_id) FILTER (WHERE n.type = 'ROLE')  AS role_ids,
             array_agg(tn.node_id) FILTER (WHERE n.type = 'SKILL') AS skill_ids
      FROM track_nodes tn JOIN nodes n ON n.id = tn.node_id
      GROUP BY tn.track_id
    ),
    eff AS (
      SELECT t.id, t.slug,
             COALESCE(o.role_ids,  po.role_ids)  AS role_ids,
             COALESCE(o.skill_ids, po.skill_ids) AS skill_ids
      FROM tracks t
      LEFT JOIN own o  ON o.track_id  = t.id
      LEFT JOIN own po ON po.track_id = t.parent_id
    ),
    pos AS (
      SELECT e.slug, p.position_id
      FROM eff e JOIN positions p ON TRUE
      WHERE p.role_node_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM nodes rn
                    WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED')
        AND (e.role_ids IS NULL OR p.role_node_id = ANY(e.role_ids))
        AND (e.skill_ids IS NULL OR EXISTS (
              SELECT 1 FROM position_nodes pn
              WHERE pn.position_id = p.position_id
                AND pn.node_id = ANY(e.skill_ids) AND pn.is_required))
    )
    SELECT pos.slug AS track_slug, pn.node_id, count(*)::int AS df
    FROM pos
    JOIN position_nodes pn ON pn.position_id = pos.position_id
    JOIN nodes n ON n.id = pn.node_id AND n.type = 'SKILL'
    GROUP BY 1, 2
  `,
);

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type TrackNode = typeof trackNodes.$inferSelect;
export type NewTrackNode = typeof trackNodes.$inferInsert;
