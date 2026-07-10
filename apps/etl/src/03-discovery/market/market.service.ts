import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../../platform/shared/eligible";

import type { VacancyAggregatesResponse } from "./market.contract";

// Market-snapshot aggregates over the eligible vacancy set: one global pass
// (total, last sync, seniority/format distributions) plus the source directory.
// No per-source breakdown — the SourceTabs that needed it is gone — so the two
// queries run concurrently.
@Injectable()
export class MarketService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getAggregates(): Promise<VacancyAggregatesResponse> {
    const [scalarRows, sourceRows] = await Promise.all([
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
      }>(sql`
        SELECT
          COUNT(*)::text                                          AS total,
          MAX(v.loaded_at)                                        AS last_sync_at,
          COUNT(*) FILTER (WHERE v.seniority = 'INTERN')::text    AS sen_intern,
          COUNT(*) FILTER (WHERE v.seniority = 'JUNIOR')::text    AS sen_junior,
          COUNT(*) FILTER (WHERE v.seniority = 'MIDDLE')::text    AS sen_middle,
          COUNT(*) FILTER (WHERE v.seniority = 'SENIOR')::text    AS sen_senior,
          COUNT(*) FILTER (WHERE v.seniority = 'LEAD')::text      AS sen_lead,
          COUNT(*) FILTER (WHERE v.seniority = 'PRINCIPAL')::text AS sen_principal,
          COUNT(*) FILTER (WHERE v.seniority = 'C_LEVEL')::text   AS sen_clevel,
          COUNT(*) FILTER (WHERE v.work_format = 'REMOTE')::text  AS wf_remote,
          COUNT(*) FILTER (WHERE v.work_format = 'OFFICE')::text  AS wf_office,
          COUNT(*) FILTER (WHERE v.work_format = 'HYBRID')::text  AS wf_hybrid
        FROM vacancies v
        WHERE ${ELIGIBLE_VACANCY}
      `),
      this.db.execute<{
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
      `),
    ]);

    const s = scalarRows.rows[0];
    return {
      total: Number(s.total),
      lastSyncAt: s.last_sync_at ? new Date(s.last_sync_at).toISOString() : null,
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
      sources: sourceRows.rows.map((r) => ({
        id: r.id,
        code: r.code,
        displayName: r.display_name,
        count: Number(r.count),
      })),
    };
  }
}
