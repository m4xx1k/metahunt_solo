DROP MATERIALIZED VIEW "public"."node_stats";--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."node_stats" AS (
    SELECT pn.node_id,
           count(DISTINCT pn.position_id)::int AS df,
           sqrt(greatest(ln((SELECT count(*) FROM positions)::float8
              / (count(DISTINCT pn.position_id) + 5)), 0)) AS weight
    FROM position_nodes pn
    JOIN nodes n ON n.id = pn.node_id
    WHERE n.status <> 'HIDDEN'
    GROUP BY pn.node_id
  );--> statement-breakpoint
CREATE UNIQUE INDEX "node_stats_node_id_idx" ON "public"."node_stats" USING btree ("node_id");
