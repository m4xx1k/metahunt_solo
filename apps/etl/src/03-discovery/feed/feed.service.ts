import { Inject, Injectable } from "@nestjs/common";

import { and, sql, type SQL } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ELIGIBLE_POSITION } from "../../platform/shared/eligible";
import { isUuid } from "../../platform/shared/query-parsing";
import { uuidList } from "../../platform/shared/sql";

import type {
  EmploymentType,
  EnglishLevel,
  FeedResponse,
  NodeRef,
  Seniority,
  SitemapVacancy,
  VacancyDto,
  WorkFormat,
} from "./feed.contract";

// The open-ended experience button: "6+" means ≥6 years. Mirrored client-side
// in features/vacancy-filters/ExperienceSection.tsx.
const EXPERIENCE_OPEN_TOKEN = "6+";
const EXPERIENCE_OPEN_MIN = 6;

export interface ApplyTarget {
  link: string;
  source?: string;
  company?: string;
}

export interface FeedSearchParams {
  page: number;
  pageSize: number;
  q?: string;
  /** Match positions with at least one Posting on this source. */
  sourceId?: string;
  /** Filter by companies.id (UUID) — the controller resolves the public slug. */
  companyId?: string;
  /** Filter by the canonical posting's role node (a ROLE node UUID). */
  roleId?: string;
  /** Match positions whose canonical role is ANY of these ROLE node UUIDs (OR). */
  roleIds?: string[];
  /** Match positions whose canonical domain is ANY of these DOMAIN node UUIDs (OR). */
  domainIds?: string[];
  /** Match positions that have ALL listed skill-node UUIDs (AND semantics). */
  skillIds?: string[];
  excludedSkillIds?: string[];
  /**
   * Skill-match scope. Default (false/undefined): a skill counts only when it's
   * `required` (must-have) on the position. When true, a nice-to-have link also
   * satisfies the filter — looser, surfaces positions where the skill is optional.
   */
  includeOptionalSkills?: boolean;
  /** Match ANY listed seniority (OR). */
  seniorities?: Seniority[];
  /** Match ANY listed work format (OR). */
  workFormats?: WorkFormat[];
  /** Match ANY listed english level (OR). */
  englishLevels?: EnglishLevel[];
  /** Match ANY listed employment type (OR). */
  employmentTypes?: EmploymentType[];
  /** Discrete experience tokens (OR): exact "0".."5" + "6+" (≥6), matched
   *  against the stated minimum. NULL always passes. */
  experienceYears?: string[];
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
  includeRoleless?: boolean;
  includeAllSkills?: boolean;
  /** When true, return ONLY Positions with more than one Posting. */
  hasDuplicates?: boolean;
  /** Freshness gate: last_source_activity_at within N days. */
  postedWithinDays?: number;
  /** Only Positions first observed after this instant (the digest "new since" window). */
  loadedAfter?: Date;
  /** Drop Positions that any of these Posting ids belongs to (digest anti-join:
   *  already-sent) — matches on the group, so a repost of an already-sent
   *  Position under a different Posting id is still excluded. */
  excludeIds?: string[];
}

interface PositionRow {
  positionId: string;
  id: string; // representative_posting_id (or the requested posting id for getById)
  externalId: string;
  title: string;
  description: string | null;
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

  postingCount: number;
  sourceCount: number;
}

// Every filter/pagination query runs against `positions p` (MET-138): a
// Position is one deduplicated market entity, so a repost across sources
// never contributes two rows or two totals. `sourceId`/skill filters reach
// into `postings`/`position_nodes` only to answer "does this Position have a
// matching member" — display always renders the Position's canonical facts
// plus its representative_posting_id's link/freshness, never a filter-
// dependent recomputation of "which member matched".
function positionsFrom(where: SQL | undefined): SQL {
  return sql`FROM positions p WHERE ${where ?? sql`true`}`;
}

@Injectable()
export class FeedService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async search(params: FeedSearchParams): Promise<FeedResponse> {
    const offset = (params.page - 1) * params.pageSize;
    const where = buildWhere(params);
    const base = positionsFrom(where);

    const pageRes = await this.db.execute<{ position_id: string }>(sql`
      SELECT p.position_id
      ${base}
      ORDER BY p.last_source_activity_at DESC, p.position_id DESC
      LIMIT ${params.pageSize} OFFSET ${offset}
    `);
    const positionIds = pageRes.rows.map((r) => r.position_id);

    const totalRes = await this.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count ${base}
    `);
    const total = totalRes.rows[0]?.count ?? 0;

    if (positionIds.length === 0) {
      return { items: [], page: params.page, pageSize: params.pageSize, total };
    }

    const rows = await this.selectPositions(sql`p.position_id IN (${uuidList(positionIds)})`);
    const byPositionId = new Map(rows.map((r) => [r.positionId, r]));
    const skills = await this.fetchSkills(positionIds, params.includeAllSkills === true);
    const items = positionIds
      .map((positionId) => {
        const row = byPositionId.get(positionId);
        return row ? toDto(row, skills.get(positionId)) : null;
      })
      .filter((x): x is VacancyDto => x !== null);

    return { items, page: params.page, pageSize: params.pageSize, total };
  }

  /**
   * Every publicly visible Position URL, slim, unpaginated — backs the sitemap.
   * Reuses `buildWhere` so the sitemap can never list a URL the feed hides,
   * nor N members of one Position as N separate pages.
   */
  async listForSitemap(postedWithinDays: number): Promise<SitemapVacancy[]> {
    const where = buildWhere({ page: 1, pageSize: 1, postedWithinDays });
    const res = await this.db.execute<{
      id: string;
      title: string;
      role_name: string | null;
      published_at: Date | null;
      updated_at: Date;
    }>(sql`
      SELECT
        po.posting_id AS id,
        p.title AS title,
        role_node.canonical_name AS role_name,
        po.published_at AS published_at,
        po.updated_at AS updated_at
      FROM positions p
      JOIN postings po ON po.posting_id = p.representative_posting_id
      LEFT JOIN nodes role_node ON role_node.id = p.role_node_id AND role_node.status = 'VERIFIED'
      WHERE ${where ?? sql`true`}
      ORDER BY p.last_source_activity_at DESC, p.position_id DESC
    `);
    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      roleName: r.role_name,
      publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  // One feed-identical card per canonical Position. The DTO keeps the current
  // representative Posting id for URLs and source links, while facts and skills
  // remain the Position's canonical ones.
  async hydratePositionsByIds(positionIds: string[]): Promise<Map<string, VacancyDto>> {
    const out = new Map<string, VacancyDto>();
    if (positionIds.length === 0) return out;
    const rows = await this.selectPositions(sql`p.position_id IN (${uuidList(positionIds)})`);
    const skills = await this.fetchSkills(positionIds, false);
    for (const row of rows) out.set(row.positionId, toDto(row, skills.get(row.positionId)));
    return out;
  }

  /**
   * Full detail for one Position, including the raw `description` body —
   * backs the public vacancy detail page (`/vacancy/:id`). Accepts ANY
   * member Posting id of the group (old shared/indexed URLs keep resolving),
   * but always renders the Position's canonical facts and current
   * representative link, not the specific requested member's own fields.
   */
  async getById(id: string): Promise<VacancyDto | null> {
    if (!isUuid(id)) return null;
    const positionByRequestedId = await this.resolvePositionIds([id]);
    const positionId = positionByRequestedId.get(id);
    if (!positionId) return null;
    const rows = await this.selectPositions(sql`p.position_id = ${positionId}::uuid`);
    const row = rows[0];
    if (!row) return null;
    const skills = await this.fetchSkills([positionId], false);
    return { ...toDto(row, skills.get(positionId)), description: row.description };
  }

  /**
   * Resolve the outbound source URL for one vacancy — backs the `/go/:id`
   * apply redirect so digest taps route through metahunt (the seam where click
   * tracking will hang). This is deliberately Posting-grain (apply/source URLs
   * are allowlisted): the requested id's OWN link, not the Position's
   * representative. Returns null for a malformed id, a missing posting, or a
   * legacy row with no link.
   */
  // Source and company ride along so an outbound click can say which board and
  // which employer it went to — a click nobody can attribute answers nothing.
  async getApplyTarget(id: string): Promise<ApplyTarget | null> {
    if (!isUuid(id)) return null;
    const rows = await this.db.execute<{
      link: string | null;
      source_code: string | null;
      company_slug: string | null;
    }>(sql`
      SELECT link, source_code, company_slug
      FROM postings WHERE posting_id = ${id}::uuid LIMIT 1
    `);
    const row = rows.rows[0];
    if (!row?.link) return null;
    return {
      link: row.link,
      source: row.source_code ?? undefined,
      company: row.company_slug ?? undefined,
    };
  }

  // Map each requested Posting id to its Position id. Silently drops
  // unknown/malformed ids from the result.
  private async resolvePositionIds(ids: string[]): Promise<Map<string, string>> {
    const valid = ids.filter(isUuid);
    const out = new Map<string, string>();
    if (valid.length === 0) return out;
    const rows = await this.db.execute<{ posting_id: string; position_id: string }>(sql`
      SELECT posting_id, position_id FROM postings WHERE posting_id IN (${uuidList(valid)})
    `);
    for (const r of rows.rows) out.set(r.posting_id, r.position_id);
    return out;
  }

  // Base Position projection: canonical facts + the representative Posting's
  // link/freshness/identity, keyed by `p.position_id`.
  private async selectPositions(where: SQL): Promise<PositionRow[]> {
    const res = await this.db.execute<{
      position_id: string;
      id: string;
      external_id: string;
      title: string;
      description: string | null;
      loaded_at: Date;
      updated_at: Date;

      seniority: VacancyDto["seniority"];
      work_format: VacancyDto["workFormat"];
      employment_type: VacancyDto["employmentType"];
      english_level: VacancyDto["englishLevel"];
      experience_years: number | null;
      engagement_type: VacancyDto["engagementType"];
      has_test_assignment: boolean | null;
      has_reservation: boolean | null;

      salary_min: number | null;
      salary_max: number | null;
      currency: VacancyDto["salary"]["currency"];

      locations: unknown;

      source_id: string;
      source_code: string;
      source_display_name: string;

      company_id: string | null;
      company_name: string | null;
      company_slug: string | null;

      role_node_id: string | null;
      role_name: string | null;

      domain_node_id: string | null;
      domain_name: string | null;

      link: string | null;
      published_at: Date | null;
      rss_record_id: string;

      posting_count: number;
      source_count: number;
    }>(sql`
      SELECT
        p.position_id,
        po.posting_id AS id,
        po.external_id,
        p.title,
        p.description,
        po.loaded_at,
        po.updated_at,

        p.seniority,
        p.work_format,
        p.employment_type,
        p.english_level,
        p.experience_years,
        p.engagement_type,
        p.has_test_assignment,
        p.has_reservation,

        p.salary_min,
        p.salary_max,
        p.currency,

        p.locations,

        po.source_id,
        po.source_code,
        po.source_display_name,

        p.company_id,
        p.company_name,
        p.company_slug,

        role_node.id AS role_node_id,
        role_node.canonical_name AS role_name,

        domain_node.id AS domain_node_id,
        domain_node.canonical_name AS domain_name,

        po.link,
        po.published_at,
        po.rss_record_id,

        p.posting_count,
        p.source_count
      FROM positions p
      JOIN postings po ON po.posting_id = p.representative_posting_id
      LEFT JOIN nodes role_node ON role_node.id = p.role_node_id AND role_node.status = 'VERIFIED'
      LEFT JOIN nodes domain_node ON domain_node.id = p.domain_node_id AND domain_node.status = 'VERIFIED'
      WHERE ${where}
    `);
    return res.rows.map((r) => ({
      positionId: r.position_id,
      id: r.id,
      externalId: r.external_id,
      title: r.title,
      description: r.description,
      // Raw `db.execute` returns driver strings, not Drizzle-mapped Dates —
      // unlike the typed `.select()` builder, it does no schema-aware parsing.
      loadedAt: new Date(r.loaded_at),
      updatedAt: new Date(r.updated_at),
      seniority: r.seniority,
      workFormat: r.work_format,
      employmentType: r.employment_type,
      englishLevel: r.english_level,
      experienceYears: r.experience_years,
      engagementType: r.engagement_type,
      hasTestAssignment: r.has_test_assignment,
      hasReservation: r.has_reservation,
      salaryMin: r.salary_min,
      salaryMax: r.salary_max,
      currency: r.currency,
      locations: r.locations,
      sourceId: r.source_id,
      sourceCode: r.source_code,
      sourceDisplayName: r.source_display_name,
      companyId: r.company_id,
      companyName: r.company_name,
      companySlug: r.company_slug,
      roleNodeId: r.role_node_id,
      roleName: r.role_name,
      domainNodeId: r.domain_node_id,
      domainName: r.domain_name,
      link: r.link,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      rssRecordId: r.rss_record_id,
      postingCount: r.posting_count,
      sourceCount: r.source_count,
    }));
  }

  private async fetchSkills(
    positionIds: string[],
    includeAllSkills: boolean,
  ): Promise<Map<string, { required: NodeRef[]; optional: NodeRef[] }>> {
    const out = new Map<string, { required: NodeRef[]; optional: NodeRef[] }>();
    if (positionIds.length === 0) return out;

    const statusGate = includeAllSkills ? sql`` : sql`AND n.status = 'VERIFIED'`;
    const rows = await this.db.execute<{
      position_id: string;
      node_id: string;
      canonical_name: string;
      is_required: boolean;
    }>(sql`
      SELECT pn.position_id, n.id AS node_id, n.canonical_name, pn.is_required
      FROM position_nodes pn
      JOIN nodes n ON n.id = pn.node_id ${statusGate}
      WHERE pn.position_id IN (${uuidList(positionIds)})
    `);

    for (const id of positionIds) out.set(id, { required: [], optional: [] });
    for (const r of rows.rows) {
      const bucket = out.get(r.position_id);
      if (!bucket) continue;
      const ref: NodeRef = { id: r.node_id, name: r.canonical_name };
      (r.is_required ? bucket.required : bucket.optional).push(ref);
    }
    return out;
  }
}

// Exported so the scoring path (RankingService) filters through the exact same
// builder — it is a strict superset of the match filters (MET-144 Stage 3).
export function buildWhere(params: FeedSearchParams): SQL | undefined {
  const conds: SQL[] = [];
  if (params.q) conds.push(sql`p.title ILIKE ${`%${params.q}%`}`);
  if (params.sourceId) {
    conds.push(sql`EXISTS (
      SELECT 1 FROM postings po WHERE po.position_id = p.position_id AND po.source_id = ${params.sourceId}::uuid
    )`);
  }
  if (params.companyId) conds.push(sql`p.company_id = ${params.companyId}::uuid`);
  if (params.roleId) conds.push(sql`p.role_node_id = ${params.roleId}::uuid`);
  // Multi-role filter (OR): match any of the listed roles.
  if (params.roleIds && params.roleIds.length > 0) {
    conds.push(sql`p.role_node_id IN (${uuidList(params.roleIds)})`);
  }
  // Multi-domain filter (OR): match any of the listed domains.
  if (params.domainIds && params.domainIds.length > 0) {
    conds.push(sql`p.domain_node_id IN (${uuidList(params.domainIds)})`);
  }
  if (params.seniorities?.length) {
    conds.push(
      sql`p.seniority IN (${sql.join(
        params.seniorities.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (params.workFormats?.length) {
    conds.push(
      sql`p.work_format IN (${sql.join(
        params.workFormats.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (params.englishLevels?.length) {
    conds.push(
      sql`p.english_level IN (${sql.join(
        params.englishLevels.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (params.employmentTypes?.length) {
    conds.push(
      sql`p.employment_type IN (${sql.join(
        params.employmentTypes.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  // Freshness gate — Position-grain: the latest source activity across every
  // member of the group, so a stale canonical posting with a recent repost
  // still passes.
  if (params.postedWithinDays !== undefined) {
    conds.push(
      sql`p.last_source_activity_at > now() - make_interval(days => ${params.postedWithinDays})`,
    );
  }
  // Discrete experience buttons (OR): exact tokens + "6+" (≥6). Lenient on NULL
  // — unstated experience always passes; only explicit non-matches are dropped.
  if (params.experienceYears && params.experienceYears.length > 0) {
    const exact = params.experienceYears.filter((t) => /^\d+$/.test(t)).map(Number);
    const openEnded = params.experienceYears.includes(EXPERIENCE_OPEN_TOKEN);
    const arms: SQL[] = [sql`p.experience_years IS NULL`];
    if (exact.length > 0) {
      arms.push(
        sql`p.experience_years IN (${sql.join(
          exact.map((n) => sql`${n}`),
          sql`, `,
        )})`,
      );
    }
    if (openEnded) arms.push(sql`p.experience_years >= ${EXPERIENCE_OPEN_MIN}`);
    if (arms.length > 1) conds.push(sql`(${sql.join(arms, sql` OR `)})`);
  }
  // "Without a test task" (false) includes unknowns: a null (unscored) position
  // still counts as "no test", so only a confirmed-true is excluded. Filtering
  // *for* a test task (true) stays strict.
  if (params.hasTestAssignment === true) {
    conds.push(sql`p.has_test_assignment = true`);
  } else if (params.hasTestAssignment === false) {
    conds.push(sql`(p.has_test_assignment = false OR p.has_test_assignment IS NULL)`);
  }
  if (params.hasReservation !== undefined) {
    conds.push(sql`p.has_reservation = ${params.hasReservation}`);
  }
  if (params.loadedAfter) conds.push(sql`p.first_observed_at > ${params.loadedAfter}`);
  if (params.excludeIds && params.excludeIds.length > 0) {
    conds.push(sql`p.position_id NOT IN (
      SELECT position_id FROM postings WHERE posting_id IN (${uuidList(params.excludeIds)})
    )`);
  }
  if (params.skillIds && params.skillIds.length > 0) {
    // AND semantics: keep only positions whose position_nodes set covers
    // every requested skill. By default a skill must be `required`; the
    // optional-scope toggle drops that gate so nice-to-have links also
    // satisfy the filter.
    const ids = params.skillIds;
    const requiredGate = params.includeOptionalSkills ? sql`` : sql`AND pn.is_required`;
    conds.push(sql`p.position_id IN (
      SELECT pn.position_id
      FROM position_nodes pn
      WHERE pn.node_id IN (${uuidList(ids)})
        ${requiredGate}
      GROUP BY pn.position_id
      HAVING COUNT(DISTINCT pn.node_id) = ${ids.length}
    )`);
  }
  if (params.excludedSkillIds?.length) {
    conds.push(sql`NOT EXISTS (
      SELECT 1
      FROM position_nodes excluded_pn
      WHERE excluded_pn.position_id = p.position_id
        AND excluded_pn.node_id IN (${uuidList(params.excludedSkillIds)})
        AND excluded_pn.is_required
    )`);
  }
  // When includeRoleless is off (default), require a VERIFIED canonical role.
  if (params.includeRoleless !== true) conds.push(ELIGIBLE_POSITION);
  // "Only duplicates" toggle: restrict to multi-member groups.
  if (params.hasDuplicates === true) conds.push(sql`p.posting_count > 1`);
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return and(...conds);
}

function toDto(
  row: PositionRow,
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

    // Keyed on id + name, not slug: a legacy empty slug is falsy, and requiring
    // it reported ~380 vacancies as having no employer at all — which also made
    // them permanently ineligible for JobPosting, where hiringOrganization is
    // required. Slugs are non-empty going forward (see slugifyCompany).
    company:
      row.companyId && row.companyName
        ? { id: row.companyId, name: row.companyName, slug: row.companySlug ?? "" }
        : null,
    role: row.roleNodeId && row.roleName ? { id: row.roleNodeId, name: row.roleName } : null,
    domain:
      row.domainNodeId && row.domainName ? { id: row.domainNodeId, name: row.domainName } : null,
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

    uniqueVacancyId: row.positionId,
    duplicateCount: row.postingCount > 1 ? row.postingCount : null,
    duplicateSourceCount: row.postingCount > 1 ? row.sourceCount : null,
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
