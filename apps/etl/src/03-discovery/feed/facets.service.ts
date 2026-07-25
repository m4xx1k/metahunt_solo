import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_VACANCY } from "../../platform/shared/eligible";

import type {
  CompanyFacetsResponse,
  DomainFacetsResponse,
  RoleFacetsResponse,
  SkillFacetsResponse,
} from "./feed.contract";

// The full role/skill catalogs the filter sidebar searches — every VERIFIED
// node over the eligible vacancy set, with its vacancy count. `id` carries the
// node slug (the URL-facing filter key `?roles=backend-engineer`), resolved back
// to the UUID at the feed controller boundary.
@Injectable()
export class FacetsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getSkillFacets(): Promise<SkillFacetsResponse> {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      count: number;
    }>(sql`
      SELECT COALESCE(n.slug, n.id::text) AS id,
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
      SELECT COALESCE(n.slug, n.id::text) AS id,
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

  async getDomainFacets(): Promise<DomainFacetsResponse> {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      count: number;
    }>(sql`
      SELECT COALESCE(n.slug, n.id::text) AS id,
             n.canonical_name AS name,
             COUNT(*)::int AS count
      FROM vacancies v
      JOIN nodes n ON n.id = v.domain_node_id AND n.type = 'DOMAIN' AND n.status = 'VERIFIED'
      WHERE ${ELIGIBLE_VACANCY}
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(*) DESC, n.canonical_name
    `);
    return {
      domains: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    };
  }

  // Counts collapse dedup groups the way the feed does, so a company's number
  // matches what its landing actually lists rather than counting reposts twice.
  async getCompanyFacets(): Promise<CompanyFacetsResponse> {
    const rows = await this.db.execute<{
      slug: string;
      name: string;
      count: number;
    }>(sql`
      SELECT c.slug AS slug,
             c.name AS name,
             COUNT(DISTINCT COALESCE(v.unique_vacancy_id, v.id))::int AS count
      FROM vacancies v
      JOIN companies c ON c.id = v.company_id
      WHERE ${ELIGIBLE_VACANCY}
      GROUP BY c.id, c.slug, c.name
      ORDER BY COUNT(DISTINCT COALESCE(v.unique_vacancy_id, v.id)) DESC, c.name
    `);
    return {
      companies: rows.rows.map((r) => ({ slug: r.slug, name: r.name, count: r.count })),
    };
  }

  /** Public company slug -> companies.id, so downstream SQL stays id-based. */
  async resolveCompanySlug(slug: string): Promise<string | null> {
    const rows = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM companies WHERE slug = ${slug} LIMIT 1
    `);
    return rows.rows[0]?.id ?? null;
  }
}
