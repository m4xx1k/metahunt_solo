DROP MATERIALIZED VIEW "public"."node_skill_cooc";--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."node_skill_cooc" AS (
    WITH position_skill AS (
      SELECT DISTINCT pn.position_id, pn.node_id
      FROM position_nodes pn
      JOIN nodes n ON n.id = pn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED'
      WHERE pn.is_required
    ),
    corpus AS (
      SELECT count(DISTINCT position_id)::float8 AS position_count FROM position_skill
    ),
    skill AS (
      SELECT node_id, count(*)::int AS support
      FROM position_skill
      GROUP BY node_id
      HAVING count(*) >= 25
    ),
    pair AS (
      SELECT a.node_id AS a_id, b.node_id AS b_id, count(*)::int AS pair_positions
      FROM position_skill a
      JOIN position_skill b ON b.position_id = a.position_id AND b.node_id > a.node_id
      JOIN skill sa ON sa.node_id = a.node_id
      JOIN skill sb ON sb.node_id = b.node_id
      GROUP BY a.node_id, b.node_id
      HAVING count(*) >= 10
    )
    SELECT p.a_id, p.b_id, p.pair_positions,
           sa.support AS a_support, sb.support AS b_support,
           c.position_count::int AS position_count,
           p.pair_positions::float8 / c.position_count AS support,
           p.pair_positions::float8 / sa.support AS p_b_given_a,
           p.pair_positions::float8 / sb.support AS p_a_given_b,
           (p.pair_positions::float8 / c.position_count)
             / ((sa.support::float8 / c.position_count) * (sb.support::float8 / c.position_count)) AS lift,
           ln((p.pair_positions::float8 / c.position_count)
             / ((sa.support::float8 / c.position_count) * (sb.support::float8 / c.position_count)))
             / -ln(p.pair_positions::float8 / c.position_count) AS npmi
    FROM pair p
    JOIN skill sa ON sa.node_id = p.a_id
    JOIN skill sb ON sb.node_id = p.b_id
    CROSS JOIN corpus c
  );--> statement-breakpoint
CREATE UNIQUE INDEX "node_skill_cooc_pair_key" ON "public"."node_skill_cooc" USING btree ("a_id", "b_id");--> statement-breakpoint
CREATE INDEX "node_skill_cooc_a" ON "public"."node_skill_cooc" USING btree ("a_id");--> statement-breakpoint
CREATE INDEX "node_skill_cooc_b" ON "public"."node_skill_cooc" USING btree ("b_id");