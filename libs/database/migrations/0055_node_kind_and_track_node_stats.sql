-- `pnpm db:generate` also re-proposed extraction_artifacts / rss_records
-- content_fingerprint / the analytics-ledger DROP TABLEs here — those are
-- NOT new. They already shipped via 0052-0054 (verified live on prod
-- 2026-09-05) but libs/database/migrations/meta/ has no 0052-0054 snapshot,
-- so drizzle-kit's diff baseline is stuck at 0051 and keeps re-detecting
-- already-applied changes as pending. That gap is a separate, pre-existing
-- issue (not touched here); this file keeps only what's actually new.
CREATE TYPE "public"."node_kind" AS ENUM('TECH', 'CONCEPT', 'SOFT');--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "kind" "node_kind";--> statement-breakpoint
CREATE VIEW "public"."track_node_stats" AS (
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
  );--> statement-breakpoint
-- Seed kind from the classification that already exists (node_tech_meta.category)
-- — 1224 nodes, no LLM pass needed. ~50 protocol/bus nodes (I2C, SPI, UART, CAN,
-- TCP/IP, Ethernet) are mis-classified PRACTICE->CONCEPT upstream; corrected by
-- hand on the hardware map later, not with regex here.
UPDATE "nodes" SET "kind" = CASE m.category
    WHEN 'LANGUAGE'  THEN 'TECH'
    WHEN 'FRAMEWORK' THEN 'TECH'
    WHEN 'LIBRARY'   THEN 'TECH'
    WHEN 'DATASTORE' THEN 'TECH'
    WHEN 'CLOUD'     THEN 'TECH'
    WHEN 'TOOL'      THEN 'TECH'
    WHEN 'PRACTICE'  THEN 'CONCEPT'
    WHEN 'SOFT'      THEN 'SOFT'
  END::"node_kind"
  FROM "node_tech_meta" m
  WHERE m.node_id = "nodes".id;
