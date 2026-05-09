import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type {
  ListVacanciesResponse,
  NodeRef,
  VacancyAggregatesResponse,
  VacancyDto,
} from "./vacancies.contract";

const {
  vacancies,
  vacancyNodes,
  nodes,
  sources,
  companies,
  rssRecords,
} = schema;

export interface ListVacanciesParams {
  page: number;
  pageSize: number;
  q?: string;
  includeRoleless?: boolean;
  includeAllSkills?: boolean;
}

interface VacancyRow {
  id: string;
  externalId: string;
  title: string;
  loadedAt: Date;
  updatedAt: Date;

  seniority: VacancyDto["seniority"];
  workFormat: VacancyDto["workFormat"];
  employmentType: VacancyDto["employmentType"];
  englishLevel: VacancyDto["englishLevel"];
  experienceYears: number | null;
  engagementType: VacancyDto["engagementType"];
  hasTestAssignment: boolean | null;
  hasReservation: boolean | null;

  salaryMin: number | null;
  salaryMax: number | null;
  currency: VacancyDto["salary"]["currency"];

  locations: unknown;

  sourceId: string;
  sourceCode: string;
  sourceDisplayName: string;

  companyId: string | null;
  companyName: string | null;
  companySlug: string | null;

  roleNodeId: string | null;
  roleName: string | null;

  domainNodeId: string | null;
  domainName: string | null;

  link: string | null;
  publishedAt: Date | null;

  rssRecordId: string;
}

const roleNode = alias(nodes, "role_node");
const domainNode = alias(nodes, "domain_node");

@Injectable()
export class VacanciesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async list(params: ListVacanciesParams): Promise<ListVacanciesResponse> {
    const offset = (params.page - 1) * params.pageSize;

    const roleJoin = and(
      eq(roleNode.id, vacancies.roleNodeId),
      eq(roleNode.status, "VERIFIED"),
    );
    const domainJoin = and(
      eq(domainNode.id, vacancies.domainNodeId),
      eq(domainNode.status, "VERIFIED"),
    );
    const where = buildWhere(params);

    const rows = (await this.db
      .select({
        id: vacancies.id,
        externalId: vacancies.externalId,
        title: vacancies.title,
        loadedAt: vacancies.loadedAt,
        updatedAt: vacancies.updatedAt,

        seniority: vacancies.seniority,
        workFormat: vacancies.workFormat,
        employmentType: vacancies.employmentType,
        englishLevel: vacancies.englishLevel,
        experienceYears: vacancies.experienceYears,
        engagementType: vacancies.engagementType,
        hasTestAssignment: vacancies.hasTestAssignment,
        hasReservation: vacancies.hasReservation,

        salaryMin: vacancies.salaryMin,
        salaryMax: vacancies.salaryMax,
        currency: vacancies.currency,

        locations: vacancies.locations,

        sourceId: sources.id,
        sourceCode: sources.code,
        sourceDisplayName: sources.displayName,

        companyId: companies.id,
        companyName: companies.name,
        companySlug: companies.slug,

        roleNodeId: roleNode.id,
        roleName: roleNode.canonicalName,

        domainNodeId: domainNode.id,
        domainName: domainNode.canonicalName,

        link: rssRecords.link,
        publishedAt: rssRecords.publishedAt,
        rssRecordId: rssRecords.id,
      })
      .from(vacancies)
      .innerJoin(sources, eq(sources.id, vacancies.sourceId))
      .innerJoin(rssRecords, eq(rssRecords.id, vacancies.lastRssRecordId))
      .leftJoin(companies, eq(companies.id, vacancies.companyId))
      .leftJoin(roleNode, roleJoin)
      .leftJoin(domainNode, domainJoin)
      .where(where)
      .orderBy(desc(vacancies.loadedAt))
      .limit(params.pageSize)
      .offset(offset)) as VacancyRow[];

    const totalRow = await this.db
      .select({ value: count() })
      .from(vacancies)
      .leftJoin(roleNode, roleJoin)
      .where(where);
    const total = totalRow[0]?.value ?? 0;

    const skillsByVacancy = await this.fetchSkills(
      rows.map((r) => r.id),
      params.includeAllSkills === true,
    );

    return {
      items: rows.map((row) => toDto(row, skillsByVacancy.get(row.id))),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }

  async getAggregates(): Promise<VacancyAggregatesResponse> {
    const ELIGIBLE = sql`
      v.role_node_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM nodes rn
        WHERE rn.id = v.role_node_id AND rn.status = 'VERIFIED'
      )
    `;

    const scalarRows = await this.db.execute<{
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
      WHERE ${ELIGIBLE}
    `);
    const s = scalarRows.rows[0];

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
      WHERE ${ELIGIBLE}
      GROUP BY s.id, s.code, s.display_name
      ORDER BY count DESC
    `);

    const skillRows = await this.db.execute<{
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
        AND ${ELIGIBLE}
      GROUP BY n.id, n.canonical_name
      ORDER BY count DESC
      LIMIT 10
    `);

    const roleRows = await this.db.execute<{
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
        AND ${ELIGIBLE}
      GROUP BY n.id, n.canonical_name
      ORDER BY count DESC
      LIMIT 6
    `);

    return {
      total: Number(s.total),
      lastSyncAt: s.last_sync_at ? new Date(s.last_sync_at).toISOString() : null,
      sources: sourceRows.rows.map((r) => ({
        id: r.id,
        code: r.code,
        displayName: r.display_name,
        count: Number(r.count),
      })),
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

  private async fetchSkills(
    vacancyIds: string[],
    includeAllSkills: boolean,
  ): Promise<Map<string, { required: NodeRef[]; optional: NodeRef[] }>> {
    const out = new Map<string, { required: NodeRef[]; optional: NodeRef[] }>();
    if (vacancyIds.length === 0) return out;

    const conds: SQL[] = [inArray(vacancyNodes.vacancyId, vacancyIds)];
    if (!includeAllSkills) conds.push(eq(nodes.status, "VERIFIED"));

    const rows = await this.db
      .select({
        vacancyId: vacancyNodes.vacancyId,
        nodeId: nodes.id,
        canonicalName: nodes.canonicalName,
        isRequired: vacancyNodes.isRequired,
      })
      .from(vacancyNodes)
      .innerJoin(nodes, eq(nodes.id, vacancyNodes.nodeId))
      .where(and(...conds));

    for (const id of vacancyIds) {
      out.set(id, { required: [], optional: [] });
    }
    for (const r of rows) {
      const bucket = out.get(r.vacancyId);
      if (!bucket) continue;
      const ref: NodeRef = { id: r.nodeId, name: r.canonicalName };
      (r.isRequired ? bucket.required : bucket.optional).push(ref);
    }
    return out;
  }
}

function buildWhere(params: ListVacanciesParams): SQL | undefined {
  const conds: SQL[] = [];
  if (params.q) conds.push(ilike(vacancies.title, `%${params.q}%`));
  // When includeRoleless is off (default), require the verified role-node
  // join to have matched. The join itself enforces VERIFIED, so this also
  // excludes vacancies whose role is unverified.
  if (params.includeRoleless !== true) conds.push(isNotNull(roleNode.id));
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return and(...conds);
}

function toDto(
  row: VacancyRow,
  skills: { required: NodeRef[]; optional: NodeRef[] } | undefined,
): VacancyDto {
  return {
    id: row.id,
    externalId: row.externalId,
    rssRecordId: row.rssRecordId,

    source: {
      id: row.sourceId,
      code: row.sourceCode,
      displayName: row.sourceDisplayName,
    },
    link: row.link,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    loadedAt: row.loadedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),

    title: row.title,
    description: null,

    company:
      row.companyId && row.companyName && row.companySlug
        ? { id: row.companyId, name: row.companyName, slug: row.companySlug }
        : null,
    role:
      row.roleNodeId && row.roleName
        ? { id: row.roleNodeId, name: row.roleName }
        : null,
    domain:
      row.domainNodeId && row.domainName
        ? { id: row.domainNodeId, name: row.domainName }
        : null,
    skills: skills ?? { required: [], optional: [] },

    seniority: row.seniority,
    workFormat: row.workFormat,
    employmentType: row.employmentType,
    englishLevel: row.englishLevel,
    experienceYears: row.experienceYears,
    engagementType: row.engagementType,

    hasTestAssignment: row.hasTestAssignment,
    hasReservation: row.hasReservation,

    salary: {
      min: row.salaryMin,
      max: row.salaryMax,
      currency: row.currency,
    },
    locations: flattenLocations(row.locations),
  };
}

function flattenLocations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l): string | null => {
      if (typeof l === "string") return l;
      if (l && typeof l === "object") {
        const city = (l as { city?: unknown }).city;
        const country = (l as { country?: unknown }).country;
        if (typeof city === "string" && typeof country === "string") {
          return `${city}, ${country}`;
        }
        if (typeof city === "string") return city;
      }
      return null;
    })
    .filter((s): s is string => s !== null);
}
