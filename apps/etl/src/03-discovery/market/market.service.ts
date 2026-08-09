import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_POSITION } from "../../platform/shared/eligible";

import type { VacancyAggregatesResponse } from "./market.contract";

// Market-snapshot aggregates over the eligible Position set (MET-138): one
// global pass (total, last activity, seniority/format distributions) plus
// the source directory. Every eligible Posting in a repost group votes once
// for its Position, never once per source.
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
          MAX(p.last_source_activity_at)                          AS last_sync_at,
          COUNT(*) FILTER (WHERE p.seniority = 'INTERN')::text    AS sen_intern,
          COUNT(*) FILTER (WHERE p.seniority = 'JUNIOR')::text    AS sen_junior,
          COUNT(*) FILTER (WHERE p.seniority = 'MIDDLE')::text    AS sen_middle,
          COUNT(*) FILTER (WHERE p.seniority = 'SENIOR')::text    AS sen_senior,
          COUNT(*) FILTER (WHERE p.seniority = 'LEAD')::text      AS sen_lead,
          COUNT(*) FILTER (WHERE p.seniority = 'PRINCIPAL')::text AS sen_principal,
          COUNT(*) FILTER (WHERE p.seniority = 'C_LEVEL')::text   AS sen_clevel,
          COUNT(*) FILTER (WHERE p.work_format = 'REMOTE')::text  AS wf_remote,
          COUNT(*) FILTER (WHERE p.work_format = 'OFFICE')::text  AS wf_office,
          COUNT(*) FILTER (WHERE p.work_format = 'HYBRID')::text  AS wf_hybrid
        FROM positions p
        WHERE ${ELIGIBLE_POSITION}
      `),
      // Posting-grain by design (allowlisted): per-source volume, unit:
      // source_postings. Restricted to Postings whose Position is eligible.
      this.db.execute<{
        id: string;
        code: string;
        display_name: string;
        count: string;
      }>(sql`
        SELECT po.source_id::text AS id,
               po.source_code AS code,
               po.source_display_name AS display_name,
               COUNT(*)::text AS count
        FROM postings po
        JOIN positions p ON p.position_id = po.position_id
        WHERE ${ELIGIBLE_POSITION}
        GROUP BY po.source_id, po.source_code, po.source_display_name
        ORDER BY COUNT(*) DESC
      `),
    ]);

    const s = scalarRows.rows[0];
    return {
      total: Number(s.total),
      unit: "positions",
      asOf: new Date().toISOString(),
      window: "all-time",
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
