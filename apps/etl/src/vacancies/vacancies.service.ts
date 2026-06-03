import { Inject, Injectable, NotFoundException } from "@nestjs/common";
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
  AggregatesPerSource,
  ContextualSkillsResponse,
  ListVacanciesResponse,
  NodeRef,
  RoleFacetsResponse,
  Seniority,
  SkillFacetsResponse,
  TrackCriteriaResponse,
  TracksResponse,
  VacancyAggregatesResponse,
  VacancyDto,
  WorkFormat,
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
  /** Filter by sources.id (UUID). */
  sourceId?: string;
  /** Filter by vacancies.roleNodeId (a ROLE node UUID). */
  roleId?: string;
  /**
   * Match vacancies whose role is ANY of these ROLE node UUIDs (OR). With
   * `trackSlug`, overrides the track's role axis (refine to specific roles)
   * while the track's skill axis still applies.
   */
  roleIds?: string[];
  /** Match vacancies that have ALL listed skill-node UUIDs (AND semantics). */
  skillIds?: string[];
  /** Browse-tree slug; resolved to the two arrays below before buildWhere. */
  trackSlug?: string;
  /**
   * Effective ROLE/SKILL node ids resolved from `trackSlug` (per-axis
   * override-else-inherit). Internal — set by `list`, consumed by
   * `buildWhere`; mirrors the track_counts view so count == click.
   */
  trackRoleIds?: string[];
  trackSkillIds?: string[];
  seniority?: Seniority;
  workFormat?: WorkFormat;
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
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
    if (params.trackSlug) {
      const resolved = await this.resolveTrackFilter(params.trackSlug);
      if (!resolved) {
        throw new NotFoundException(`Unknown trackSlug "${params.trackSlug}"`);
      }
      // Lazy-refine: explicit roleIds narrow the track's role axis (a subset
      // the user kept on), but the track's own skill criteria still bind. The
      // explicit roleIds branch in buildWhere is then suppressed to avoid a
      // redundant duplicate of the same condition.
      const refinedRoleIds =
        params.roleIds && params.roleIds.length > 0
          ? params.roleIds
          : resolved.roleIds;
      params = {
        ...params,
        roleIds: undefined,
        trackRoleIds: refinedRoleIds,
        trackSkillIds: resolved.skillIds,
      };
    }

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
    // Source directory + counts is global-only; per-source slices skip
    // this query by design.
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
      WHERE
        v.role_node_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM nodes rn
          WHERE rn.id = v.role_node_id AND rn.status = 'VERIFIED'
        )
      GROUP BY s.id, s.code, s.display_name
      ORDER BY COUNT(*) DESC
    `);

    const sources = sourceRows.rows.map((r) => ({
      id: r.id,
      code: r.code,
      displayName: r.display_name,
      count: Number(r.count),
    }));

    // Compute global + per-source aggregates in parallel. With N sources
    // this fans out 3*(N+1) round-trips; at N=2 (Djinni/DOU) it's 9
    // round-trips, all parallel — ~50ms on the dev set.
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

  // The browse tree: every active track plus its inherited vacancy count.
  // Returned flat; the web nests by parentSlug and applies the hide-zero rule
  // (a node is hidden only if count===0 AND it has no visible child, so
  // grouping parents like "By Language" survive on their children's counts).
  async getTracks(): Promise<TracksResponse> {
    const rows = await this.db.execute<{
      slug: string;
      label: string;
      parent_slug: string | null;
      count: number;
      sort_order: number;
    }>(sql`
      SELECT t.slug AS slug,
             t.label AS label,
             pt.slug AS parent_slug,
             COALESCE(tc.vacancy_count, 0)::int AS count,
             t.sort_order AS sort_order
      FROM tracks t
      LEFT JOIN tracks pt ON pt.id = t.parent_id
      LEFT JOIN track_counts tc ON tc.track_id = t.id
      WHERE t.is_active
      ORDER BY t.sort_order, t.slug
    `);
    return {
      tracks: rows.rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        parentSlug: r.parent_slug,
        count: r.count,
        sortOrder: r.sort_order,
      })),
    };
  }

  // Contextual skill facet under an active track: the skills most common in
  // the track's matched vacancies, excluding the track's own skill criteria
  // (those are already applied). Recomputed per track only — stable while the
  // user toggles individual skill chips.
  async getContextualSkills(slug: string): Promise<ContextualSkillsResponse> {
    const resolved = await this.resolveTrackFilter(slug);
    if (!resolved) throw new NotFoundException(`Unknown trackSlug "${slug}"`);

    const roleCond =
      resolved.roleIds.length > 0
        ? sql`v.role_node_id IN (${sql.join(
            resolved.roleIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`
        : sql`true`;
    const skillCond =
      resolved.skillIds.length > 0
        ? sql`EXISTS (
            SELECT 1 FROM vacancy_nodes vn
            WHERE vn.vacancy_id = v.id
              AND vn.node_id IN (${sql.join(
                resolved.skillIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})
          )`
        : sql`true`;
    // Grouping track with no effective criteria → empty facet (matches the 0 count).
    if (resolved.roleIds.length === 0 && resolved.skillIds.length === 0) {
      return { skills: [] };
    }
    const excludeOwn =
      resolved.skillIds.length > 0
        ? sql`AND n.id NOT IN (${sql.join(
            resolved.skillIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`
        : sql``;

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
      WHERE vn.vacancy_id IN (
        SELECT v.id FROM vacancies v
        JOIN nodes rn ON rn.id = v.role_node_id AND rn.status = 'VERIFIED'
        WHERE ${roleCond} AND ${skillCond}
      )
      ${excludeOwn}
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(DISTINCT vn.vacancy_id) DESC
      LIMIT 12
    `);
    return {
      skills: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    };
  }

  // The track's effective criteria per axis (id + canonical name, ordered by
  // name): the ROLE/SKILL nodes resolved via override-else-inherit. Both axes
  // power the unified facet panels — presets on by default, the user toggles
  // to narrow or adds to widen. A pure-grouping track returns empty arrays.
  // The page reads these as the feed's effective axes when the URL is bare.
  async getTrackCriteria(slug: string): Promise<TrackCriteriaResponse> {
    const resolved = await this.resolveTrackFilter(slug);
    if (!resolved) throw new NotFoundException(`Unknown trackSlug "${slug}"`);
    const ids = [...resolved.roleIds, ...resolved.skillIds];
    if (ids.length === 0) return { roles: [], skills: [] };

    const rows = await this.db.execute<{
      id: string;
      name: string;
      type: string;
    }>(sql`
      SELECT n.id::text AS id, n.canonical_name AS name, n.type::text AS type
      FROM nodes n
      WHERE n.id IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      ORDER BY n.canonical_name
    `);
    const pick = (t: string): NodeRef[] =>
      rows.rows
        .filter((r) => r.type === t)
        .map((r) => ({ id: r.id, name: r.name }));
    return { roles: pick("ROLE"), skills: pick("SKILL") };
  }

  // Every VERIFIED SKILL over the eligible set (role verified), with the
  // distinct-vacancy count, ranked by popularity. Powers the sidebar skill
  // search across the whole catalog — not just the aggregates topN.
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
      WHERE v.role_node_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM nodes rn
          WHERE rn.id = v.role_node_id AND rn.status = 'VERIFIED'
        )
      GROUP BY n.id, n.canonical_name
      ORDER BY COUNT(DISTINCT vn.vacancy_id) DESC, n.canonical_name
    `);
    return {
      skills: rows.rows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
    };
  }

  // Every VERIFIED ROLE in use, with its vacancy count — the full role
  // catalog for the refine panel's search-and-add.
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

  // Resolve a track slug to its effective ROLE/SKILL node ids: per axis, the
  // track's own nodes of that type, or — if it has none — its parent's (one
  // hop). Returns null for an unknown/inactive slug. Both arrays empty means a
  // pure grouping track (no criteria on either axis).
  private async resolveTrackFilter(
    slug: string,
  ): Promise<{ roleIds: string[]; skillIds: string[] } | null> {
    const rows = await this.db.execute<{
      track_id: string | null;
      role_ids: string[] | null;
      skill_ids: string[] | null;
    }>(sql`
      WITH t AS (
        SELECT id, parent_id FROM tracks WHERE slug = ${slug} AND is_active
      ),
      own AS (
        SELECT n.type AS ntype, array_agg(tn.node_id::text) AS ids
        FROM track_nodes tn
        JOIN nodes n ON n.id = tn.node_id
        WHERE tn.track_id = (SELECT id FROM t)
        GROUP BY n.type
      ),
      par AS (
        SELECT n.type AS ntype, array_agg(tn.node_id::text) AS ids
        FROM track_nodes tn
        JOIN nodes n ON n.id = tn.node_id
        WHERE tn.track_id = (SELECT parent_id FROM t)
        GROUP BY n.type
      )
      SELECT
        (SELECT id::text FROM t) AS track_id,
        COALESCE((SELECT ids FROM own WHERE ntype = 'ROLE'),
                 (SELECT ids FROM par WHERE ntype = 'ROLE'))  AS role_ids,
        COALESCE((SELECT ids FROM own WHERE ntype = 'SKILL'),
                 (SELECT ids FROM par WHERE ntype = 'SKILL')) AS skill_ids
    `);
    const row = rows.rows[0];
    if (!row || row.track_id === null) return null;
    return {
      roleIds: row.role_ids ?? [],
      skillIds: row.skill_ids ?? [],
    };
  }

  private async computeAggregates(
    sourceId?: string,
  ): Promise<AggregatesPerSource> {
    const sourceFilter = sourceId
      ? sql`AND v.source_id = ${sourceId}::uuid`
      : sql``;
    const ELIGIBLE = sql`
      v.role_node_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM nodes rn
        WHERE rn.id = v.role_node_id AND rn.status = 'VERIFIED'
      )
      ${sourceFilter}
    `;

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
        WHERE ${ELIGIBLE}
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
          AND ${ELIGIBLE}
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
          AND ${ELIGIBLE}
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
  if (params.sourceId) conds.push(eq(vacancies.sourceId, params.sourceId));
  if (params.roleId) conds.push(eq(vacancies.roleNodeId, params.roleId));
  // Standalone multi-role filter (OR). When a trackSlug is present, `list`
  // has already folded roleIds into trackRoleIds and cleared this, so we
  // never double-apply the role axis.
  if (params.roleIds && params.roleIds.length > 0) {
    conds.push(inArray(vacancies.roleNodeId, params.roleIds));
  }
  if (params.seniority) conds.push(eq(vacancies.seniority, params.seniority));
  if (params.workFormat) {
    conds.push(eq(vacancies.workFormat, params.workFormat));
  }
  if (params.hasTestAssignment !== undefined) {
    conds.push(eq(vacancies.hasTestAssignment, params.hasTestAssignment));
  }
  if (params.hasReservation !== undefined) {
    conds.push(eq(vacancies.hasReservation, params.hasReservation));
  }
  if (params.skillIds && params.skillIds.length > 0) {
    // AND semantics: keep only vacancies whose vacancy_nodes set covers
    // every requested skill. One subquery (not N joins) keeps both the
    // list and the count query — which share buildWhere — single-pass.
    const ids = params.skillIds;
    conds.push(sql`${vacancies.id} IN (
      SELECT vn.vacancy_id
      FROM vacancy_nodes vn
      WHERE vn.node_id IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      GROUP BY vn.vacancy_id
      HAVING COUNT(DISTINCT vn.node_id) = ${ids.length}
    )`);
  }
  if (params.trackSlug) {
    // Effective ROLE/SKILL sets were resolved from the slug (override-else-
    // inherit). Apply them exactly as the track_counts view does so a track's
    // shown count equals what this filter returns. A grouping track with no
    // criteria on either axis (e.g. "By Language") matches nothing — the view
    // counts it 0, so the click must too.
    const trackRoleIds = params.trackRoleIds ?? [];
    const trackSkillIds = params.trackSkillIds ?? [];
    if (trackRoleIds.length === 0 && trackSkillIds.length === 0) {
      conds.push(sql`false`);
    } else {
      if (trackRoleIds.length > 0) {
        conds.push(inArray(vacancies.roleNodeId, trackRoleIds));
      }
      if (trackSkillIds.length > 0) {
        conds.push(sql`EXISTS (
          SELECT 1 FROM vacancy_nodes vn
          WHERE vn.vacancy_id = ${vacancies.id}
            AND vn.node_id IN (${sql.join(
              trackSkillIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
        )`);
      }
    }
  }
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
