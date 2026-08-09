import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_POSITION } from "../../platform/shared/eligible";

import type {
  CompanyFacetsResponse,
  DomainFacetsResponse,
  RoleFacetsResponse,
  SkillFacetsResponse,
} from "./feed.contract";

// The full role/skill catalogs the filter sidebar searches — every VERIFIED
// node over the eligible Position set (MET-138), with its Position count.
// `id` carries the node slug (the URL-facing filter key
// `?roles=backend-engineer`), resolved back to the UUID at the feed controller
// boundary. Counts are Position-grain: a reposted Position never counts twice.
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
             COUNT(DISTINCT pn.position_id)::int AS count
      FROM position_nodes pn
      JOIN nodes n ON n.id = pn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED'
      JOIN positions p ON p.position_id = pn.position_id
      WHERE ${ELIGIBLE_POSITION}
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(DISTINCT pn.position_id) DESC, n.canonical_name
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
      FROM positions p
      JOIN nodes n ON n.id = p.role_node_id AND n.type = 'ROLE' AND n.status = 'VERIFIED'
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(*) DESC, n.canonical_name
    `);
    // Retired slugs ride along on this already-ISR-cached call so the role hub
    // can 308 a merged-away URL instead of 404ing it, without a second request.
    const retired = await this.db.execute<{ from_slug: string; to_slug: string }>(sql`
      SELECT a.slug AS from_slug, n.slug AS to_slug
      FROM node_slug_aliases a
      JOIN nodes n ON n.id = a.node_id AND n.status = 'VERIFIED'
      WHERE a.type = 'ROLE' AND n.slug IS NOT NULL
    `);

    return {
      roles: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
      retired: Object.fromEntries(retired.rows.map((r) => [r.from_slug, r.to_slug])),
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
      FROM positions p
      JOIN nodes n ON n.id = p.domain_node_id AND n.type = 'DOMAIN' AND n.status = 'VERIFIED'
      WHERE ${ELIGIBLE_POSITION}
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(*) DESC, n.canonical_name
    `);
    return {
      domains: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    };
  }

  // One row per Position already (canonical company), so a plain COUNT(*)
  // never double-counts a repost the way the old posting-grain query had to
  // guard against with COUNT(DISTINCT coalesce(...)).
  async getCompanyFacets(): Promise<CompanyFacetsResponse> {
    const rows = await this.db.execute<{
      slug: string;
      name: string;
      count: number;
    }>(sql`
      SELECT p.company_slug AS slug,
             p.company_name AS name,
             COUNT(*)::int AS count
      FROM positions p
      WHERE ${ELIGIBLE_POSITION} AND p.company_id IS NOT NULL
      GROUP BY p.company_id, p.company_slug, p.company_name
      ORDER BY COUNT(*) DESC, p.company_name
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
