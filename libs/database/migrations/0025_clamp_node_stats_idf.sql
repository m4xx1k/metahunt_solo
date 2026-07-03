-- Custom SQL migration file, put your code below! --
-- Clamp the IDF weight so REFRESH never hits sqrt() of a negative number.
-- ln(N/(df+5)) goes negative once a skill's df approaches N (df > N-5); the
-- prior sqrt() then errored the whole matview refresh. greatest(..., 0) floors
-- an ultra-common skill's weight at 0 (zero IDF signal, the correct semantics)
-- instead of crashing. Behaviour-identical for real data (nothing hits the floor).
DROP MATERIALIZED VIEW "public"."node_stats";--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."node_stats" AS (
    SELECT vn.node_id,
           count(DISTINCT vn.vacancy_id)::int AS df,
           sqrt(greatest(ln((SELECT count(*) FROM vacancies)::float8
              / (count(DISTINCT vn.vacancy_id) + 5)), 0)) AS weight
    FROM vacancy_nodes vn
    JOIN nodes n ON n.id = vn.node_id
    WHERE n.status <> 'HIDDEN'
    GROUP BY vn.node_id
  );--> statement-breakpoint
CREATE UNIQUE INDEX "node_stats_node_id_idx" ON "public"."node_stats" USING btree ("node_id");
