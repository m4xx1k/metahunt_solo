import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../shared/eligible";
import type {
  RoleFacetsResponse,
  SkillFacetsResponse,
} from "./feed.contract";

// The full role/skill catalogs the filter sidebar searches — every VERIFIED
// node over the eligible vacancy set, with its vacancy count.
@Injectable()
export class FacetsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getSkillFacets(): Promise<SkillFacetsResponse> {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      count: number;
    }>(sql`
      SELECT n.id::text AS id,
             n.canonical_name AS name,
             COUNT(DISTINCT vn.vacancy_id)::int AS count
      FROM vacancy_nodes vn
      JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED'
      JOIN vacancies v ON v.id = vn.vacancy_id
      WHERE ${ELIGIBLE_VACANCY}
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(DISTINCT vn.vacancy_id) DESC, n.canonical_name
    `);
    return {
      skills: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    };
  }

  async getRoleFacets(): Promise<RoleFacetsResponse> {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      count: number;
    }>(sql`
      SELECT n.id::text AS id,
             n.canonical_name AS name,
             COUNT(*)::int AS count
      FROM vacancies v
      JOIN nodes n ON n.id = v.role_node_id AND n.type = 'ROLE' AND n.status = 'VERIFIED'
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(*) DESC, n.canonical_name
    `);
    return {
      roles: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    };
  }
}
