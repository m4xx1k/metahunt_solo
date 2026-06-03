import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../shared/eligible";
import type {
  AggregatesPerSource,
  VacancyAggregatesResponse,
} from "./market.contract";

// Market-snapshot aggregates over the eligible vacancy set: global plus a
// per-source breakdown.
@Injectable()
export class MarketService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getAggregates(): Promise<VacancyAggregatesResponse> {
    // The source directory is global-only; per-source slices skip this query.
    const sourceRows = await this.db.execute<{
      id: string;
      code: string;
      display_name: string;
      count: string;
    }>(sql`
      SELECT s.id::text AS id,
             s.code AS code,
             s.display_name AS display_name,
             COUNT(*)::text AS count
      FROM vacancies v
      JOIN sources s ON s.id = v.source_id
      WHERE ${ELIGIBLE_VACANCY}
      GROUP BY s.id, s.code, s.display_name
      ORDER BY COUNT(*) DESC
    `);

    const sources = sourceRows.rows.map((r) => ({
      id: r.id,
      code: r.code,
      displayName: r.display_name,
      count: Number(r.count),
    }));

    // Global + per-source aggregates in parallel: 3*(N+1) round-trips, all
    // concurrent — ~50ms on the dev set at N=2 (Djinni/DOU).
    const [global, ...perSourceArr] = await Promise.all([
      this.computeAggregates(),
      ...sources.map((s) => this.computeAggregates(s.id)),
    ]);

    const bySource: Record<string, AggregatesPerSource> = {};
    sources.forEach((s, idx) => {
      bySource[s.code] = perSourceArr[idx];
    });

    return { ...global, sources, bySource };
  }

  private async computeAggregates(
    sourceId?: string,
  ): Promise<AggregatesPerSource> {
    const sourceFilter = sourceId
      ? sql`AND v.source_id = ${sourceId}::uuid`
      : sql``;

    const [scalarRows, skillRows, roleRows] = await Promise.all([
      this.db.execute<{
        total: string;
        last_sync_at: Date | null;

        sen_intern: string;
        sen_junior: string;
        sen_middle: string;
        sen_senior: string;
        sen_lead: string;
        sen_principal: string;
        sen_clevel: string;

        wf_remote: string;
        wf_office: string;
        wf_hybrid: string;

        eng_product: string;
        eng_outsource: string;
        eng_outstaff: string;
        eng_startup: string;
        eng_agency: string;

        reservation_known: string;
        reservation_true: string;
        salary_disclosed: string;
      }>(sql`
        SELECT
          COUNT(*)::text                                                                  AS total,
          MAX(v.loaded_at)                                                                AS last_sync_at,

          COUNT(*) FILTER (WHERE v.seniority = 'INTERN')::text                            AS sen_intern,
          COUNT(*) FILTER (WHERE v.seniority = 'JUNIOR')::text                            AS sen_junior,
          COUNT(*) FILTER (WHERE v.seniority = 'MIDDLE')::text                            AS sen_middle,
          COUNT(*) FILTER (WHERE v.seniority = 'SENIOR')::text                            AS sen_senior,
          COUNT(*) FILTER (WHERE v.seniority = 'LEAD')::text                              AS sen_lead,
          COUNT(*) FILTER (WHERE v.seniority = 'PRINCIPAL')::text                         AS sen_principal,
          COUNT(*) FILTER (WHERE v.seniority = 'C_LEVEL')::text                           AS sen_clevel,

          COUNT(*) FILTER (WHERE v.work_format = 'REMOTE')::text                          AS wf_remote,
          COUNT(*) FILTER (WHERE v.work_format = 'OFFICE')::text                          AS wf_office,
          COUNT(*) FILTER (WHERE v.work_format = 'HYBRID')::text                          AS wf_hybrid,

          COUNT(*) FILTER (WHERE v.engagement_type = 'PRODUCT')::text                     AS eng_product,
          COUNT(*) FILTER (WHERE v.engagement_type = 'OUTSOURCE')::text                   AS eng_outsource,
          COUNT(*) FILTER (WHERE v.engagement_type = 'OUTSTAFF')::text                    AS eng_outstaff,
          COUNT(*) FILTER (WHERE v.engagement_type = 'STARTUP')::text                     AS eng_startup,
          COUNT(*) FILTER (WHERE v.engagement_type = 'AGENCY')::text                      AS eng_agency,

          COUNT(*) FILTER (WHERE v.has_reservation IS NOT NULL)::text                     AS reservation_known,
          COUNT(*) FILTER (WHERE v.has_reservation = true)::text                          AS reservation_true,
          COUNT(*) FILTER (WHERE v.salary_min IS NOT NULL OR v.salary_max IS NOT NULL)::text
                                                                                          AS salary_disclosed
        FROM vacancies v
        WHERE ${ELIGIBLE_VACANCY} ${sourceFilter}
      `),
      this.db.execute<{
        id: string;
        name: string;
        count: string;
      }>(sql`
        SELECT n.id::text AS id,
               n.canonical_name AS name,
               COUNT(DISTINCT vn.vacancy_id)::text AS count
        FROM vacancy_nodes vn
        JOIN nodes n ON n.id = vn.node_id
        JOIN vacancies v ON v.id = vn.vacancy_id
        WHERE n.type = 'SKILL'
          AND n.status = 'VERIFIED'
          AND ${ELIGIBLE_VACANCY} ${sourceFilter}
        GROUP BY n.id, n.canonical_name
        ORDER BY COUNT(DISTINCT vn.vacancy_id) DESC
        LIMIT 10
      `),
      this.db.execute<{
        id: string;
        name: string;
        count: string;
      }>(sql`
        SELECT n.id::text AS id,
               n.canonical_name AS name,
               COUNT(*)::text AS count
        FROM vacancies v
        JOIN nodes n ON n.id = v.role_node_id
        WHERE n.type = 'ROLE'
          AND ${ELIGIBLE_VACANCY} ${sourceFilter}
        GROUP BY n.id, n.canonical_name
        ORDER BY COUNT(*) DESC
        LIMIT 6
      `),
    ]);

    const s = scalarRows.rows[0];
    return {
      total: Number(s.total),
      lastSyncAt: s.last_sync_at ? new Date(s.last_sync_at).toISOString() : null,
      topSkills: skillRows.rows.map((r) => ({
        id: r.id,
        name: r.name,
        count: Number(r.count),
      })),
      topRoles: roleRows.rows.map((r) => ({
        id: r.id,
        name: r.name,
        count: Number(r.count),
      })),
      seniorityDist: {
        INTERN: Number(s.sen_intern),
        JUNIOR: Number(s.sen_junior),
        MIDDLE: Number(s.sen_middle),
        SENIOR: Number(s.sen_senior),
        LEAD: Number(s.sen_lead),
        PRINCIPAL: Number(s.sen_principal),
        C_LEVEL: Number(s.sen_clevel),
      },
      workFormatDist: {
        REMOTE: Number(s.wf_remote),
        OFFICE: Number(s.wf_office),
        HYBRID: Number(s.wf_hybrid),
      },
      engagementDist: {
        PRODUCT: Number(s.eng_product),
        OUTSOURCE: Number(s.eng_outsource),
        OUTSTAFF: Number(s.eng_outstaff),
        STARTUP: Number(s.eng_startup),
        AGENCY: Number(s.eng_agency),
      },
      reservationKnownCount: Number(s.reservation_known),
      reservationTrueCount: Number(s.reservation_true),
      salaryDisclosedCount: Number(s.salary_disclosed),
    };
  }
}
