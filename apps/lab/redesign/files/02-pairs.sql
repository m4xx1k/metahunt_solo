-- Experiment 002 — position-grain skill sets and pair metrics (MET-129, Phases 2-4)
--
-- Builds the reproducible dataset the graph reads. Everything lives in the
-- lab database, which is a disposable restore — these tables are derived
-- artifacts, never a source of truth.
--
-- v1 analytical contract:
--   grain               canonical position (unique_vacancies.id)
--   cohort              positions whose canonical posting was extracted under
--                       the anyOf contract (metalab_cohort) — flat extractions
--                       carry no "or" signal and would read every pair as "and"
--   skill eligibility   nodes.type='SKILL' AND nodes.status='VERIFIED'
--   requirement layer   vacancy_nodes.is_required = true  (REQUIRED <-> REQUIRED)
--   position skill rule 'rep'   = skills of the canonical member  (baseline)
--                       'union' = skills of any member            (sensitivity)
--   liveness claim      none
--
-- The two rules are built side by side on purpose. A canonical position can
-- have members whose extractions disagree, and collapsing that silently would
-- hide an extraction-quality signal inside a market number.

DROP VIEW IF EXISTS metalab_edge;

-- The anyOf contract emits every requirement as an {anyOf: [...]} object; the
-- flat contract emitted bare strings. The shape of the stored answer is the
-- only per-row marker of which contract produced it — a date window is not.
DROP TABLE IF EXISTS metalab_cohort;
CREATE TABLE metalab_cohort AS
SELECT uv.id AS position_id
FROM unique_vacancies uv
JOIN vacancies v ON v.id = uv.canonical_vacancy_id
JOIN rss_records r ON r.id = v.last_rss_record_id
WHERE jsonb_typeof(COALESCE(r.extracted_data->'skills'->'required'->0,
                            r.extracted_data->'skills'->'optional'->0)) = 'object';
ALTER TABLE metalab_cohort ADD PRIMARY KEY (position_id);

-- A grouped position outside the cohort means the marker no longer tracks the
-- contract; every substitute number downstream would be wrong, so stop here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM position_nodes pn
    WHERE pn.requirement_group IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM metalab_cohort c WHERE c.position_id = pn.position_id)
  ) THEN
    RAISE EXCEPTION 'metalab_cohort: a grouped position falls outside the anyOf cohort';
  END IF;
END $$;

DROP TABLE IF EXISTS metalab_position_skill;
CREATE TABLE metalab_position_skill (
  rule              text     NOT NULL,
  position_id       uuid     NOT NULL,
  node_id           uuid     NOT NULL,
  requirement_group smallint,
  PRIMARY KEY (rule, position_id, node_id)
);

-- Canonical-only: the Position read model's own definition (MET-138) — one
-- designated member (the canonical posting) speaks for the position.
INSERT INTO metalab_position_skill (rule, position_id, node_id, requirement_group)
SELECT 'rep', pn.position_id, pn.node_id, pn.requirement_group
FROM position_nodes pn
JOIN metalab_cohort c ON c.position_id = pn.position_id
JOIN nodes n ON n.id = pn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED'
WHERE pn.is_required;

-- Member union: a skill is required for the position if ANY member says so.
-- Disagreement resolves toward "required" rather than dropping the link,
-- which is the direction that inflates — hence it is the sensitivity arm and
-- not the default. No requirement_group here: group numbers are local to one
-- posting, so group 1 of one member and group 1 of another are unrelated.
INSERT INTO metalab_position_skill (rule, position_id, node_id)
SELECT DISTINCT 'union', v.unique_vacancy_id, vn.node_id
FROM vacancies v
JOIN metalab_cohort c ON c.position_id = v.unique_vacancy_id
JOIN vacancy_nodes vn ON vn.vacancy_id = v.id AND vn.is_required
JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED';

CREATE INDEX metalab_ps_node_idx ON metalab_position_skill (rule, node_id);

-- Per-rule corpus size. N is the number of positions that carry at least one
-- eligible skill: the denominator every probability below is computed against.
DROP TABLE IF EXISTS metalab_corpus;
CREATE TABLE metalab_corpus AS
SELECT rule, count(DISTINCT position_id)::bigint AS n_positions
FROM metalab_position_skill GROUP BY rule;

DROP TABLE IF EXISTS metalab_skill;
CREATE TABLE metalab_skill AS
SELECT
  ps.rule,
  ps.node_id,
  n.canonical_name,
  n.slug,
  count(*)::bigint AS support,
  count(*)::float8 / c.n_positions AS prevalence
FROM metalab_position_skill ps
JOIN nodes n ON n.id = ps.node_id
JOIN metalab_corpus c ON c.rule = ps.rule
GROUP BY ps.rule, ps.node_id, n.canonical_name, n.slug, c.n_positions;

ALTER TABLE metalab_skill ADD PRIMARY KEY (rule, node_id);

-- Pair counts. Ordered pair a<b once, then metrics are symmetric except the
-- two conditional probabilities. Only skills clearing min support take part:
-- experiment 001 set that at 25 positions, where a conditional probability
-- first has a usable interval (~+/-10pp at p=0.5). It is an absolute count,
-- so it does not scale down with a smaller cohort.
--
-- substitute_positions: both skills sit in the SAME anyOf group of the
-- posting ("A or B"). Everything else is a complement ("A and B").
DROP TABLE IF EXISTS metalab_pair;
CREATE TABLE metalab_pair AS
WITH eligible AS (
  SELECT ps.rule, ps.position_id, ps.node_id, ps.requirement_group
  FROM metalab_position_skill ps
  JOIN metalab_skill s ON s.rule = ps.rule AND s.node_id = ps.node_id
  WHERE s.support >= 25
)
SELECT
  a.rule,
  a.node_id AS a_id,
  b.node_id AS b_id,
  count(*)::bigint AS pair_positions,
  count(*) FILTER (WHERE a.requirement_group = b.requirement_group)::bigint AS substitute_positions
FROM eligible a
JOIN eligible b
  ON b.rule = a.rule AND b.position_id = a.position_id AND b.node_id > a.node_id
GROUP BY a.rule, a.node_id, b.node_id;

ALTER TABLE metalab_pair ADD PRIMARY KEY (rule, a_id, b_id);

-- The metrics view. Counts stay visible next to every normalized number so a
-- spectacular lift can always be checked against the sample it came from.
--
--   support          P(A,B)          share of all positions carrying both
--   P(B|A)           pair/count(A)   asymmetric: read it in the stated direction
--   lift             P(A,B)/(P(A)P(B))   1.0 = independent
--   NPMI             pmi / -ln P(A,B)    in [-1,1], comparable across prevalences
--   substitute_rate  share of the pair's positions where it was "A or B"
--   complement_*     the same lift/NPMI over "A and B" positions only; NULL
--                    when the pair was never asked for together
DROP VIEW IF EXISTS metalab_edge;
CREATE VIEW metalab_edge AS
SELECT
  p.rule,
  p.a_id,
  p.b_id,
  sa.canonical_name AS a_name,
  sb.canonical_name AS b_name,
  p.pair_positions,
  p.substitute_positions,
  p.pair_positions - p.substitute_positions                     AS complement_positions,
  sa.support AS a_support,
  sb.support AS b_support,
  c.n_positions,
  p.pair_positions::float8 / c.n_positions                      AS support,
  p.pair_positions::float8 / sa.support                         AS p_b_given_a,
  p.pair_positions::float8 / sb.support                         AS p_a_given_b,
  (p.pair_positions::float8 / c.n_positions) / (sa.prevalence * sb.prevalence) AS lift,
  ln((p.pair_positions::float8 / c.n_positions) / (sa.prevalence * sb.prevalence))
    / -ln(p.pair_positions::float8 / c.n_positions)             AS npmi,
  p.substitute_positions::float8 / p.pair_positions             AS substitute_rate,
  CASE WHEN p.pair_positions > p.substitute_positions THEN
    ((p.pair_positions - p.substitute_positions)::float8 / c.n_positions) / (sa.prevalence * sb.prevalence)
  END                                                           AS complement_lift,
  CASE WHEN p.pair_positions > p.substitute_positions THEN
    ln(((p.pair_positions - p.substitute_positions)::float8 / c.n_positions) / (sa.prevalence * sb.prevalence))
      / -ln((p.pair_positions - p.substitute_positions)::float8 / c.n_positions)
  END                                                           AS complement_npmi
FROM metalab_pair p
JOIN metalab_skill sa ON sa.rule = p.rule AND sa.node_id = p.a_id
JOIN metalab_skill sb ON sb.rule = p.rule AND sb.node_id = p.b_id
JOIN metalab_corpus c ON c.rule = p.rule;

\echo '=== corpus ==='
SELECT rule, n_positions, (SELECT count(*) FROM metalab_cohort) AS cohort_positions
FROM metalab_corpus ORDER BY rule;

\echo '=== eligible skills and pairs per rule ==='
SELECT rule,
       (SELECT count(*) FROM metalab_skill s WHERE s.rule = c.rule) AS skills_total,
       (SELECT count(*) FROM metalab_skill s WHERE s.rule = c.rule AND s.support >= 25) AS skills_eligible,
       (SELECT count(*) FROM metalab_pair p WHERE p.rule = c.rule) AS pairs_total
FROM metalab_corpus c ORDER BY rule;

\echo '=== pair-support distribution (sets the min pair threshold) ==='
SELECT rule,
       count(*) AS pairs,
       count(*) FILTER (WHERE pair_positions >= 5)  AS ge_5,
       count(*) FILTER (WHERE pair_positions >= 10) AS ge_10,
       count(*) FILTER (WHERE pair_positions >= 25) AS ge_25,
       count(*) FILTER (WHERE pair_positions >= 50) AS ge_50
FROM metalab_pair GROUP BY rule ORDER BY rule;
