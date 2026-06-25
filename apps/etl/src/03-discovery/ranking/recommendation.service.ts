import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../../platform/shared/eligible";

import {
  FIT_GOOD_MIN,
  FIT_STRONG_MIN,
  REC_DF_FLOOR,
  REC_GENERIC_DF_SHARE,
  REC_MIN_COHORT,
  REC_TOP_N,
  type RecommendItem,
  type RecommendResponse,
  type SkillRef,
} from "./ranking.contract";
import { markLeverage, recCoveragePct } from "./recommendation.derive";
import { cohortSeniorities } from "./seniority-band";

const reduced = (cohortSize: number, coveragePct: number): RecommendResponse => ({
  cohortSize,
  coveragePct,
  reducedState: true,
  items: [],
  redundant: [],
});

// "What to learn next" — a marginal counterfactual over the candidate's role
// cohort (same role node, seniority band ±1 incl. NULL). For each near-miss
// vacancy (required coverage < GOOD), a missing required skill S "unlocks" it
// iff (matched_required_w + idf(S)) / required_total_w >= GOOD. Aggregated per S,
// guarded to VERIFIED nodes with a cohort df-floor and a generic df-ceiling.
// See md/journal/decisions/0009-cv-skill-recommendations.md.
@Injectable()
export class RecommendationService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async recommend(
    refs: SkillRef[],
    roleNodeId: string | null,
    seniority: string | null,
  ): Promise<RecommendResponse> {
    if (!roleNodeId) return reduced(0, 0);

    const bandList = sql.join(
      cohortSeniorities(seniority).map((b) => sql`${b}`),
      sql`, `,
    );
    const cohortCond = sql`v.role_node_id = ${roleNodeId}::uuid
      AND (v.seniority::text IN (${bandList}) OR v.seniority IS NULL)
      AND ${ELIGIBLE_VACANCY}`;

    // No candidate skills → can't compute a counterfactual; still report the
    // cohort size so the UI can explain the reduced state.
    if (refs.length === 0) {
      const sizeRes = await this.db.execute<{ cohort_size: number }>(sql`
        SELECT count(*)::int AS cohort_size FROM vacancies v WHERE ${cohortCond}
      `);
      return reduced(sizeRes.rows[0]?.cohort_size ?? 0, 0);
    }

    const cand = sql.join(
      refs.map((r) => sql`(${r.id}::uuid)`),
      sql`, `,
    );
    // Shared prefix: the cohort, its required-skill rows (VERIFIED-or-NEW, with
    // candidate membership), and per-vacancy required coverage weights. Reused by
    // the scalar, item, and redundant queries so all three see one cohort.
    const cohortCte = sql`
      cand(node_id) AS (VALUES ${cand}),
      cohort AS (
        SELECT v.id FROM vacancies v WHERE ${cohortCond}
      ),
      vreq AS (
        SELECT c.id AS vacancy_id, vn.node_id, n.status AS node_status,
               ns.weight::float8 AS weight,
               (vn.node_id IN (SELECT node_id FROM cand)) AS in_cand
        FROM cohort c
        JOIN vacancy_nodes vn ON vn.vacancy_id = c.id AND vn.is_required
        JOIN nodes n ON n.id = vn.node_id AND n.status <> 'HIDDEN'
        JOIN node_stats ns ON ns.node_id = vn.node_id
      ),
      vcov AS (
        SELECT vacancy_id,
               SUM(weight) AS required_total_w,
               COALESCE(SUM(weight) FILTER (WHERE in_cand), 0) AS matched_required_w
        FROM vreq GROUP BY vacancy_id
      )`;

    const scalars = await this.db.execute<{
      cohort_size: number;
      covered: number;
    }>(sql`
      WITH ${cohortCte}
      SELECT
        (SELECT count(*) FROM cohort)::int AS cohort_size,
        (SELECT count(*) FROM vcov
          WHERE required_total_w > 0
            AND matched_required_w / required_total_w >= ${FIT_GOOD_MIN})::int AS covered
    `);
    const cohortSize = scalars.rows[0]?.cohort_size ?? 0;
    const coveragePct = recCoveragePct(scalars.rows[0]?.covered ?? 0, cohortSize);
    if (cohortSize < REC_MIN_COHORT) return reduced(cohortSize, coveragePct);

    const itemRows = await this.db.execute<{
      node_id: string;
      name: string;
      unlocks: number;
      to_strong: number;
      idf: number;
    }>(sql`
      WITH ${cohortCte},
      nearmiss AS (
        SELECT vacancy_id, required_total_w, matched_required_w
        FROM vcov
        WHERE required_total_w > 0
          AND matched_required_w / required_total_w < ${FIT_GOOD_MIN}
      ),
      unlock AS (
        SELECT vr.node_id, nm.vacancy_id,
               (nm.matched_required_w + vr.weight) / nm.required_total_w AS new_cov
        FROM nearmiss nm
        JOIN vreq vr ON vr.vacancy_id = nm.vacancy_id
        WHERE NOT vr.in_cand AND vr.node_status = 'VERIFIED'
      ),
      agg AS (
        SELECT node_id,
               count(*) FILTER (WHERE new_cov >= ${FIT_GOOD_MIN}) AS unlocks,
               count(*) FILTER (WHERE new_cov >= ${FIT_STRONG_MIN}) AS to_strong
        FROM unlock GROUP BY node_id
      ),
      sdf AS (
        SELECT node_id, count(DISTINCT vacancy_id) AS cohort_df
        FROM vreq WHERE node_status = 'VERIFIED' GROUP BY node_id
      )
      SELECT a.node_id::text AS node_id, n.canonical_name AS name,
             a.unlocks::int AS unlocks, a.to_strong::int AS to_strong,
             ns.weight::float8 AS idf
      FROM agg a
      JOIN sdf s ON s.node_id = a.node_id
      JOIN nodes n ON n.id = a.node_id
      JOIN node_stats ns ON ns.node_id = a.node_id
      WHERE a.unlocks >= 1
        AND s.cohort_df >= ${REC_DF_FLOOR}
        AND s.cohort_df::float8 / ${cohortSize} <= ${REC_GENERIC_DF_SHARE}
      ORDER BY a.unlocks DESC, ns.weight DESC
      LIMIT ${REC_TOP_N}
    `);

    const redundantRows = await this.db.execute<{ name: string }>(sql`
      WITH ${cohortCte},
      cdf AS (
        SELECT node_id, count(DISTINCT vacancy_id) AS cohort_df
        FROM vreq GROUP BY node_id
      )
      SELECT n.canonical_name AS name
      FROM cand c
      JOIN cdf d ON d.node_id = c.node_id
      JOIN nodes n ON n.id = c.node_id
      WHERE d.cohort_df::float8 / ${cohortSize} > ${REC_GENERIC_DF_SHARE}
      ORDER BY d.cohort_df DESC
    `);

    const items: RecommendItem[] = markLeverage(
      itemRows.rows.map((r) => ({
        nodeId: r.node_id,
        name: r.name,
        unlocks: r.unlocks,
        toStrong: r.to_strong,
        idf: r.idf,
      })),
    );

    return {
      cohortSize,
      coveragePct,
      reducedState: false,
      items,
      redundant: redundantRows.rows.map((r) => r.name),
    };
  }
}
