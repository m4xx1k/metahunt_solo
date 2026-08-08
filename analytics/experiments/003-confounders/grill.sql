-- GRILL — attack ten specific edges (MET-129 required deliverable)
--
-- Each edge is chosen to test a different failure mode, not to look good.
-- Role-conditioned lift is only reported where in-role pair support >= 10;
-- below that the within-role number is noise and saying it would be the exact
-- sin this section exists to catch.

DROP VIEW IF EXISTS metalab_grill;
CREATE VIEW metalab_grill AS
WITH picks(a_name, b_name, why) AS (VALUES
  ('I2C',        'SPI',        'highest NPMI — embedded bus cluster'),
  ('Prometheus', 'Grafana',    'famous pairing, high count AND high lift'),
  ('.NET',       'C#',         'platform/language — near-tautological?'),
  ('TensorFlow', 'PyTorch',    'SUBSTITUTES scoring as complements'),
  ('TypeScript', 'React',      'largest pair count in the corpus'),
  ('SQL',        'Python',     'huge count, near-zero association'),
  ('Docker',     'Kubernetes', 'genuine complement, both very common'),
  ('DAST',       'SAST',       'perfect conditional on tiny support'),
  ('Redis',      'PostgreSQL', 'both common, mid lift — real or composition?'),
  ('CAN',        'UART',       'embedded again — does role explain all of it?')
),
edge AS (
  SELECT p.why, e.*
  FROM picks p
  JOIN metalab_edge e ON e.rule = 'rep'
   AND ((e.a_name = p.a_name AND e.b_name = p.b_name)
     OR (e.a_name = p.b_name AND e.b_name = p.a_name))
),
by_role AS (
  SELECT e.a_id, e.b_id, m.role_name, rd.n AS role_positions,
         count(DISTINCT m.position_id) FILTER (WHERE pa.position_id IS NOT NULL AND pb.position_id IS NOT NULL) AS both_cnt,
         count(DISTINCT m.position_id) FILTER (WHERE pa.position_id IS NOT NULL) AS a_cnt,
         count(DISTINCT m.position_id) FILTER (WHERE pb.position_id IS NOT NULL) AS b_cnt
  FROM edge e
  CROSS JOIN metalab_position_meta m
  JOIN (SELECT m2.role_name, count(DISTINCT ps.position_id) AS n
        FROM metalab_position_meta m2
        JOIN metalab_position_skill ps ON ps.position_id = m2.position_id AND ps.rule='rep'
        GROUP BY m2.role_name HAVING count(DISTINCT ps.position_id) >= 300) rd
    ON rd.role_name = m.role_name
  LEFT JOIN metalab_position_skill pa ON pa.rule='rep' AND pa.position_id=m.position_id AND pa.node_id=e.a_id
  LEFT JOIN metalab_position_skill pb ON pb.rule='rep' AND pb.position_id=m.position_id AND pb.node_id=e.b_id
  GROUP BY e.a_id, e.b_id, m.role_name, rd.n
),
dominant AS (
  SELECT *, row_number() OVER (PARTITION BY a_id, b_id ORDER BY both_cnt DESC) AS rk
  FROM by_role WHERE both_cnt >= 10
),
by_source AS (
  SELECT e.a_id, e.b_id,
         count(DISTINCT m.position_id) FILTER (WHERE m.source_code='djinni' AND pa.position_id IS NOT NULL AND pb.position_id IS NOT NULL) AS djinni_both,
         count(DISTINCT m.position_id) FILTER (WHERE m.source_code='dou'    AND pa.position_id IS NOT NULL AND pb.position_id IS NOT NULL) AS dou_both,
         count(DISTINCT m.position_id) FILTER (WHERE m.source_code='djinni' AND pa.position_id IS NOT NULL) AS djinni_a,
         count(DISTINCT m.position_id) FILTER (WHERE m.source_code='dou'    AND pa.position_id IS NOT NULL) AS dou_a
  FROM edge e
  CROSS JOIN metalab_position_meta m
  LEFT JOIN metalab_position_skill pa ON pa.rule='rep' AND pa.position_id=m.position_id AND pa.node_id=e.a_id
  LEFT JOIN metalab_position_skill pb ON pb.rule='rep' AND pb.position_id=m.position_id AND pb.node_id=e.b_id
  GROUP BY e.a_id, e.b_id
),
union_arm AS (
  SELECT e.a_id, e.b_id, u.npmi AS union_npmi
  FROM edge e LEFT JOIN metalab_edge u
    ON u.rule='union' AND u.a_id = e.a_id AND u.b_id = e.b_id
)
SELECT
  e.a_name, e.b_name, e.why,
  e.pair_positions, e.a_support, e.b_support,
  round(e.p_b_given_a::numeric,3) AS p_b_a,
  round(e.lift::numeric,2)  AS lift,
  round(e.npmi::numeric,3)  AS npmi,
  round(ua.union_npmi::numeric,3) AS npmi_union,
  d.role_name AS dominant_role,
  d.both_cnt  AS pairs_in_role,
  round(((d.both_cnt::numeric * d.role_positions) / nullif(d.a_cnt::numeric * d.b_cnt,0)),2) AS lift_in_role,
  round(100.0 * d.both_cnt / e.pair_positions, 0) AS pct_from_role,
  s.djinni_both, s.dou_both,
  round((s.djinni_both::numeric / nullif(s.djinni_a,0)),2) AS p_b_a_djinni,
  round((s.dou_both::numeric    / nullif(s.dou_a,0)),2)    AS p_b_a_dou
FROM edge e
LEFT JOIN dominant d ON d.a_id=e.a_id AND d.b_id=e.b_id AND d.rk=1
LEFT JOIN by_source s ON s.a_id=e.a_id AND s.b_id=e.b_id
LEFT JOIN union_arm ua ON ua.a_id=e.a_id AND ua.b_id=e.b_id;

\echo '=== GRILL: evidence per edge ==='
SELECT a_name, b_name, pair_positions, a_support, b_support, p_b_a, lift, npmi, npmi_union
FROM metalab_grill ORDER BY npmi DESC;

\echo '=== GRILL: role confounding (only where in-role pairs >= 10) ==='
SELECT a_name, b_name, lift AS global_lift, dominant_role, pairs_in_role, lift_in_role, pct_from_role
FROM metalab_grill ORDER BY lift DESC;

\echo '=== GRILL: source holdout ==='
SELECT a_name, b_name, djinni_both, dou_both, p_b_a_djinni, p_b_a_dou,
       round(abs(p_b_a_djinni - p_b_a_dou), 2) AS gap
FROM metalab_grill ORDER BY abs(p_b_a_djinni - p_b_a_dou) DESC NULLS LAST;
