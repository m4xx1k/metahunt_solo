-- Experiment 002b — does the position skill rule change the conclusions?
--
-- Phase 2 of MET-129 demands this be measured, not assumed. If representative
-- and union agree, the baseline is robust and we say so. If they disagree, the
-- aggregation rule is a first-class analytical parameter and must stay visible.

\echo '=== 1. Corpus and link mass by rule ==='
SELECT c.rule, c.n_positions,
       (SELECT count(*) FROM metalab_position_skill p WHERE p.rule = c.rule) AS skill_links,
       round(100.0 * (SELECT count(*) FROM metalab_position_skill p WHERE p.rule = c.rule)
             / (SELECT count(*) FROM metalab_position_skill p WHERE p.rule = 'rep'), 2) AS pct_of_rep
FROM metalab_corpus c ORDER BY c.rule;

\echo '=== 2. How many positions actually gain a skill under union ==='
WITH per AS (
  SELECT position_id,
         count(*) FILTER (WHERE rule = 'rep')   AS rep_skills,
         count(*) FILTER (WHERE rule = 'union') AS union_skills
  FROM metalab_position_skill GROUP BY position_id
)
SELECT count(*)                                              AS positions,
       count(*) FILTER (WHERE union_skills > rep_skills)     AS gained,
       round(100.0 * count(*) FILTER (WHERE union_skills > rep_skills) / count(*), 2) AS pct_gained,
       count(*) FILTER (WHERE rep_skills = 0)                AS rep_only_empty,
       round(avg(union_skills - rep_skills), 3)              AS mean_delta,
       max(union_skills - rep_skills)                        AS max_delta
FROM per;

\echo '=== 3. Top-30 skills by support — rank stability across rules ==='
WITH r AS (
  SELECT rule, canonical_name, support,
         row_number() OVER (PARTITION BY rule ORDER BY support DESC) AS rnk
  FROM metalab_skill
)
SELECT rep.rnk AS rep_rank, rep.canonical_name, rep.support AS rep_support,
       un.support AS union_support, un.rnk AS union_rank,
       un.rnk - rep.rnk AS rank_shift
FROM r rep JOIN r un ON un.rule = 'union' AND un.canonical_name = rep.canonical_name
WHERE rep.rule = 'rep' AND rep.rnk <= 30
ORDER BY rep.rnk;

\echo '=== 4. Top-25 edges by NPMI (rep), with the union values beside them ==='
SELECT e.a_name, e.b_name, e.pair_positions,
       round(e.p_b_given_a::numeric, 3) AS p_b_a,
       round(e.lift::numeric, 2)  AS lift,
       round(e.npmi::numeric, 3)  AS npmi,
       round(u.npmi::numeric, 3)  AS npmi_union,
       round((u.npmi - e.npmi)::numeric, 3) AS npmi_delta
FROM metalab_edge e
LEFT JOIN metalab_edge u ON u.rule = 'union' AND u.a_id = e.a_id AND u.b_id = e.b_id
WHERE e.rule = 'rep' AND e.pair_positions >= 10
ORDER BY e.npmi DESC LIMIT 25;

\echo '=== 5. Rank correlation of NPMI between rules (pairs present in both) ==='
WITH ranked AS (
  SELECT e.a_id, e.b_id,
         row_number() OVER (ORDER BY e.npmi DESC) AS rep_rank,
         row_number() OVER (ORDER BY u.npmi DESC) AS union_rank
  FROM metalab_edge e
  JOIN metalab_edge u ON u.rule = 'union' AND u.a_id = e.a_id AND u.b_id = e.b_id
  WHERE e.rule = 'rep' AND e.pair_positions >= 10 AND u.pair_positions >= 10
)
SELECT count(*) AS pairs_compared,
       round(corr(rep_rank, union_rank)::numeric, 4) AS spearman_rho,
       round(avg(abs(rep_rank - union_rank))::numeric, 1) AS mean_abs_rank_shift,
       max(abs(rep_rank - union_rank)) AS max_rank_shift
FROM ranked;

\echo '=== 6. Edges that exist under one rule only (at pair support >= 10) ==='
SELECT
  (SELECT count(*) FROM metalab_edge e WHERE e.rule='rep' AND e.pair_positions >= 10
     AND NOT EXISTS (SELECT 1 FROM metalab_edge u WHERE u.rule='union'
                     AND u.a_id=e.a_id AND u.b_id=e.b_id AND u.pair_positions >= 10)) AS rep_only,
  (SELECT count(*) FROM metalab_edge u WHERE u.rule='union' AND u.pair_positions >= 10
     AND NOT EXISTS (SELECT 1 FROM metalab_edge e WHERE e.rule='rep'
                     AND e.a_id=u.a_id AND e.b_id=u.b_id AND e.pair_positions >= 10)) AS union_only,
  (SELECT count(*) FROM metalab_edge e WHERE e.rule='rep' AND e.pair_positions >= 10) AS rep_total;
