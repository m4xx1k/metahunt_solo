DROP MATERIALIZED VIEW "public"."node_stats";--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."node_stats" AS (
    SELECT vn.node_id,
           count(DISTINCT vn.vacancy_id)::int AS df,
           ln((SELECT count(*) FROM vacancies)::float8
              / (count(DISTINCT vn.vacancy_id) + 5)) AS weight
    FROM vacancy_nodes vn
    JOIN nodes n ON n.id = vn.node_id
    WHERE n.status <> 'HIDDEN'
    GROUP BY vn.node_id
  );--> statement-breakpoint
CREATE UNIQUE INDEX "node_stats_node_id_idx" ON "public"."node_stats" USING btree ("node_id");