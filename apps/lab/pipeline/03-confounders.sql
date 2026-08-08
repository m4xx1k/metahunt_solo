-- Experiment 003 — is an edge an ecosystem relationship, or just role composition?
-- (MET-129 Phase 5 + the GRILL's role/source attacks)
--
-- Backend Engineer alone is 17.6% of the corpus, so any backend-flavoured pair
-- will look strong globally for a boring reason. The question each block below
-- asks is whether the association survives INSIDE the segment that supplies it.
--
-- Baseline rule throughout: 'rep' (experiment 002b showed union changes nothing
-- that matters, Spearman rho = 0.9984).

DROP TABLE IF EXISTS metalab_position_meta;
CREATE TABLE metalab_position_meta AS
SELECT uv.id AS position_id,
       v.source_id,
       s.code       AS source_code,
       v.role_node_id,
       r.canonical_name AS role_name,
       v.seniority::text AS seniority
FROM unique_vacancies uv
JOIN vacancies v ON v.id = uv.canonical_vacancy_id
JOIN sources s ON s.id = v.source_id
LEFT JOIN nodes r ON r.id = v.role_node_id;
ALTER TABLE metalab_position_meta ADD PRIMARY KEY (position_id);
CREATE INDEX metalab_pm_role_idx ON metalab_position_meta (role_node_id);

\echo '=== 1. Role segments large enough to condition on (>= 300 positions) ==='
SELECT m.role_name, count(*) AS positions
FROM metalab_position_meta m
JOIN metalab_position_skill ps ON ps.position_id = m.position_id AND ps.rule = 'rep'
GROUP BY m.role_name HAVING count(DISTINCT m.position_id) >= 300
ORDER BY count(*) DESC;

\echo '=== 2. Role-conditioned check on the strongest global edges ==='
-- For each top edge, recompute inside the role that contributes most of it.
-- A real ecosystem link keeps a high lift within the role; a composition
-- artifact collapses toward lift = 1 once the role is held constant.
WITH top_edges AS (
  SELECT a_id, b_id, a_name, b_name, pair_positions, lift, npmi
  FROM metalab_edge WHERE rule = 'rep' AND pair_positions >= 25
  ORDER BY npmi DESC LIMIT 15
),
role_n AS (
  SELECT m.role_node_id, m.role_name, count(DISTINCT ps.position_id) AS n
  FROM metalab_position_meta m
  JOIN metalab_position_skill ps ON ps.position_id = m.position_id AND ps.rule = 'rep'
  GROUP BY m.role_node_id, m.role_name HAVING count(DISTINCT ps.position_id) >= 300
),
in_role AS (
  SELECT t.a_id, t.b_id, t.a_name, t.b_name, t.pair_positions, t.lift, t.npmi,
         rn.role_name, rn.n AS role_positions,
         count(*) FILTER (WHERE pa.position_id IS NOT NULL AND pb.position_id IS NOT NULL) AS both_in_role,
         count(*) FILTER (WHERE pa.position_id IS NOT NULL) AS a_in_role,
         count(*) FILTER (WHERE pb.position_id IS NOT NULL) AS b_in_role
  FROM top_edges t
  CROSS JOIN role_n rn
  JOIN metalab_position_meta m ON m.role_node_id = rn.role_node_id
  LEFT JOIN metalab_position_skill pa
         ON pa.rule='rep' AND pa.position_id = m.position_id AND pa.node_id = t.a_id
  LEFT JOIN metalab_position_skill pb
         ON pb.rule='rep' AND pb.position_id = m.position_id AND pb.node_id = t.b_id
  GROUP BY t.a_id, t.b_id, t.a_name, t.b_name, t.pair_positions, t.lift, t.npmi, rn.role_name, rn.n
),
best AS (
  SELECT *, row_number() OVER (PARTITION BY a_id, b_id ORDER BY both_in_role DESC) AS rk
  FROM in_role WHERE both_in_role > 0
)
SELECT a_name, b_name, pair_positions AS global_pairs,
       round(lift::numeric, 1) AS global_lift,
       role_name AS dominant_role, both_in_role AS pairs_in_role, role_positions,
       round((both_in_role::numeric * role_positions) / nullif(a_in_role::numeric * b_in_role, 0), 1) AS lift_within_role,
       round(100.0 * both_in_role / pair_positions, 0) AS pct_of_edge_from_role
FROM best WHERE rk = 1 ORDER BY npmi DESC;

\echo '=== 3. Source holdout — is an edge carried by one board? ==='
-- djinni owns 56.9% of positions and dou 43.1%, so a genuine edge should
-- appear in both at a similar conditional probability.
WITH top_edges AS (
  SELECT a_id, b_id, a_name, b_name, pair_positions
  FROM metalab_edge WHERE rule = 'rep' AND pair_positions >= 25
  ORDER BY npmi DESC LIMIT 15
),
per_source AS (
  SELECT t.a_name, t.b_name, t.pair_positions, m.source_code,
         count(DISTINCT m.position_id) FILTER (WHERE pa.position_id IS NOT NULL AND pb.position_id IS NOT NULL) AS both_cnt,
         count(DISTINCT m.position_id) FILTER (WHERE pa.position_id IS NOT NULL) AS a_cnt
  FROM top_edges t
  CROSS JOIN metalab_position_meta m
  LEFT JOIN metalab_position_skill pa ON pa.rule='rep' AND pa.position_id=m.position_id AND pa.node_id=t.a_id
  LEFT JOIN metalab_position_skill pb ON pb.rule='rep' AND pb.position_id=m.position_id AND pb.node_id=t.b_id
  GROUP BY t.a_name, t.b_name, t.pair_positions, m.source_code
)
SELECT a_name, b_name, pair_positions,
       sum(both_cnt) FILTER (WHERE source_code='djinni') AS djinni_pairs,
       sum(both_cnt) FILTER (WHERE source_code='dou')    AS dou_pairs,
       round(100.0 * sum(both_cnt) FILTER (WHERE source_code='djinni') / nullif(sum(both_cnt),0), 0) AS pct_djinni,
       round((sum(both_cnt) FILTER (WHERE source_code='djinni'))::numeric
             / nullif(sum(a_cnt) FILTER (WHERE source_code='djinni'),0), 2) AS p_b_a_djinni,
       round((sum(both_cnt) FILTER (WHERE source_code='dou'))::numeric
             / nullif(sum(a_cnt) FILTER (WHERE source_code='dou'),0), 2) AS p_b_a_dou
FROM per_source GROUP BY a_name, b_name, pair_positions
ORDER BY pair_positions DESC;

\echo '=== 4. The popularity trap — highest pair counts vs their lift ==='
-- The pairs a naive "co-occurrence count" graph would rank first.
SELECT a_name, b_name, pair_positions, a_support, b_support,
       round(p_b_given_a::numeric, 3) AS p_b_a,
       round(lift::numeric, 2) AS lift, round(npmi::numeric, 3) AS npmi
FROM metalab_edge WHERE rule='rep'
ORDER BY pair_positions DESC LIMIT 15;

\echo '=== 5. The sparse-tail trap — highest lift at low support ==='
SELECT a_name, b_name, pair_positions, a_support, b_support,
       round(lift::numeric, 1) AS lift, round(npmi::numeric, 3) AS npmi
FROM metalab_edge WHERE rule='rep' AND pair_positions < 10
ORDER BY lift DESC LIMIT 15;
