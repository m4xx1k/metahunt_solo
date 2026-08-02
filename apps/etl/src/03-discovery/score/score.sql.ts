import { sql, type SQL } from "drizzle-orm";

import { FIT_GOOD_MIN, FIT_STRONG_MIN } from "../ranking/ranking.contract";

// The live scoring pass, extracted verbatim from RankingService so every
// consumer (warm /match, the /feed lab route, role suggestions) scores against
// ONE definition of Fit. Still live SQL: no materialized score column yet — see
// MET-120 for the EXPLAIN ANALYZE that a "materialize this" decision needs.

// The shared aggregation pipeline: candidate VALUES → stack-set → overlap
// probe → one weighted pass per scored vacancy → coverage (fitTierWeighted's
// SQL twin). `cand` is a VALUES row list `(uuid), (uuid)`.
export function scoringCtes(cand: SQL): SQL {
  return sql`
      cand(node_id) AS (VALUES ${cand}),
      -- candidate stack-set; empty => on_stack uniformly true (no-op). ADR-0010.
      css AS (
        SELECT DISTINCT m.stack FROM cand c
        JOIN node_tech_meta m ON m.node_id = c.node_id
        WHERE m.is_core AND m.stack IS NOT NULL
      ),
      -- vacancies worth scoring: overlap probe (vacancy_nodes.node_id index).
      ov AS (
        SELECT DISTINCT vn.vacancy_id AS id
        FROM vacancy_nodes vn
        JOIN cand c ON c.node_id = vn.node_id
      ),
      -- one pass per scored vacancy: relevance + weighted denominators + stack
      -- flags. node_stats is HIDDEN-free; both meta tables are 1-row-per-node.
      agg AS (
        SELECT vn.vacancy_id AS id,
               SUM(ns.weight) FILTER (WHERE c.node_id IS NOT NULL)::float8 AS relevance,
               COALESCE(SUM(ns.weight) FILTER (WHERE c.node_id IS NOT NULL AND vn.is_required), 0)::float8 AS matched_required_w,
               count(*) FILTER (WHERE vn.is_required) AS required_total,
               COALESCE(SUM(ns.weight) FILTER (WHERE vn.is_required), 0)::float8 AS required_total_w,
               COALESCE(SUM(ns.weight), 0)::float8 AS all_w,
               bool_or(tm.is_core AND vn.is_required AND tm.stack IS NOT NULL) AS has_concrete_core,
               bool_or(tm.is_core AND vn.is_required AND tm.stack IN (SELECT stack FROM css)) AS has_instack_core
        FROM ov
        JOIN vacancy_nodes vn ON vn.vacancy_id = ov.id
        JOIN node_stats ns ON ns.node_id = vn.node_id
        LEFT JOIN cand c ON c.node_id = vn.node_id
        LEFT JOIN node_tech_meta tm ON tm.node_id = vn.node_id
        GROUP BY vn.vacancy_id
      ),
      -- weighted required coverage; all-skills share when nothing is required.
      scored AS (
        SELECT agg.*,
               CASE
                 WHEN required_total = 0 THEN
                   CASE WHEN all_w > 0 THEN COALESCE(relevance, 0) / all_w ELSE 0 END
                 ELSE
                   CASE WHEN required_total_w > 0 THEN matched_required_w / required_total_w ELSE 0 END
               END AS coverage
        FROM agg
      )`;
}

// scoringCtes + the `ranked` projection every ranked query selects from:
// relevance + coverage + tier_bucket (mirrors fitTierWeighted: STRONG=2/GOOD=1/
// STRETCH=0) + the ADR-0010 on_stack flag.
export function rankedCte(cand: SQL): SQL {
  return sql`
      ${scoringCtes(cand)},
      ranked AS (
        SELECT id, relevance, coverage,
               CASE
                 WHEN coverage >= ${FIT_STRONG_MIN} THEN 2
                 WHEN coverage >= ${FIT_GOOD_MIN} THEN 1
                 ELSE 0
               END AS tier_bucket,
               -- off-stack only when the vacancy positively belongs to another
               -- stack (concrete-stack required core, none in css); else on-stack.
               CASE
                 WHEN NOT EXISTS (SELECT 1 FROM css) THEN true
                 WHEN COALESCE(has_concrete_core, false)
                      AND NOT COALESCE(has_instack_core, false) THEN false
                 ELSE true
               END AS on_stack
        FROM scored
      )`;
}
