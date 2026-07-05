import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { uuidList } from "../../platform/shared/sql";
import type {
  EmploymentType,
  EnglishLevel,
  FeedResponse,
  NodeRef,
  Seniority,
  VacancyDto,
  WorkFormat,
} from "./feed.contract";

const {
  vacancies,
  vacancyNodes,
  nodes,
  sources,
  companies,
  rssRecords,
  uniqueVacancies,
} = schema;

// This vacancy is the display representative of its dedup group — no other
// member is fresher (published_at, then loaded_at, then id as a stable
// tiebreak). Ungrouped rows and singletons trivially qualify. Every group
// (gold or confirmed) collapses to exactly this row; collapsing to the
// freshest member keeps a bumped repost at the top of the freshness-sorted
// feed. Reused by the collapse predicate and the badge projection so the two
// never drift. Safe pre-resolve: NULL unique_vacancy_id → first arm passes.
const isGroupRepresentative = sql`(
  ${vacancies.uniqueVacancyId} IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM vacancies fresher
    WHERE fresher.unique_vacancy_id = ${vacancies.uniqueVacancyId}
      AND (
        coalesce(fresher.published_at, fresher.loaded_at)
          > coalesce(${vacancies.publishedAt}, ${vacancies.loadedAt})
        OR (
          coalesce(fresher.published_at, fresher.loaded_at)
            = coalesce(${vacancies.publishedAt}, ${vacancies.loadedAt})
          AND fresher.id > ${vacancies.id}
        )
      )
  )
)`;

// Postgres `uuid` columns reject malformed input at the driver level, so screen
// path params before they reach a query.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The open-ended experience button: "6+" means ≥6 years. Mirrored client-side
// in features/vacancy-filters/ExperienceSection.tsx.
const EXPERIENCE_OPEN_TOKEN = "6+";
const EXPERIENCE_OPEN_MIN = 6;

export interface FeedSearchParams {
  page: number;
  pageSize: number;
  q?: string;
  /** Filter by sources.id (UUID). */
  sourceId?: string;
  /** Filter by vacancies.roleNodeId (a ROLE node UUID). */
  roleId?: string;
  /** Match vacancies whose role is ANY of these ROLE node UUIDs (OR). */
  roleIds?: string[];
  /** Match vacancies whose domain is ANY of these DOMAIN node UUIDs (OR). */
  domainIds?: string[];
  /** Match vacancies that have ALL listed skill-node UUIDs (AND semantics). */
  skillIds?: string[];
  /**
   * Skill-match scope. Default (false/undefined): a skill counts only when it's
   * `required` (must-have) on the vacancy. When true, a nice-to-have link also
   * satisfies the filter — looser, surfaces vacancies where the skill is optional.
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
  /** When true, return ONLY the canonical card of a collapsed gold group (>1 member). */
  hasDuplicates?: boolean;
  /** Freshness gate: coalesce(published_at, loaded_at) within N days. */
  postedWithinDays?: number;
  /** Only vacancies first loaded after this instant (the digest "new since" window). */
  loadedAfter?: Date;
  /** Drop these vacancy ids from the result (digest anti-join: already-sent). */
  excludeIds?: string[];
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

  uniqueVacancyId: string | null;
  duplicateCount: number | null;
  duplicateSourceCount: number | null;
}

const roleNode = alias(nodes, "role_node");
const domainNode = alias(nodes, "domain_node");

// VERIFIED-gated role/domain joins, shared by the list, count, and hydrate
// queries. Module-level so selectVacancies and the count query reuse one defn.
const roleJoin = and(
  eq(roleNode.id, vacancies.roleNodeId),
  eq(roleNode.status, "VERIFIED"),
);
const domainJoin = and(
  eq(domainNode.id, vacancies.domainNodeId),
  eq(domainNode.status, "VERIFIED"),
);

@Injectable()
export class FeedService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async search(params: FeedSearchParams): Promise<FeedResponse> {
    const offset = (params.page - 1) * params.pageSize;
    const where = buildWhere(params);

    const rows = (await this.selectVacancies(where)
      // Freshest by publish date first (bump = alive). Fall back to loadedAt when
      // publishedAt is null; id as a stable tiebreaker for offset pagination.
      .orderBy(
        desc(sql`coalesce(${vacancies.publishedAt}, ${vacancies.loadedAt})`),
        desc(vacancies.id),
      )
      .limit(params.pageSize)
      .offset(offset)) as VacancyRow[];

    const totalRow = await this.db
      .select({ value: count() })
      .from(vacancies)
      .leftJoin(roleNode, roleJoin)
      .leftJoin(uniqueVacancies, eq(uniqueVacancies.id, vacancies.uniqueVacancyId))
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

  // Hydrate full vacancy DTOs by id — feed-identical cards for the reverse-ATS
  // matcher. Verified skills only (the feed default). Returned as a map so the
  // caller keeps its own ordering (the matcher orders by relevance).
  async hydrateByIds(ids: string[]): Promise<Map<string, VacancyDto>> {
    const out = new Map<string, VacancyDto>();
    if (ids.length === 0) return out;
    const rows = (await this.selectVacancies(
      inArray(vacancies.id, ids),
    )) as VacancyRow[];
    const skills = await this.fetchSkills(ids, false);
    for (const row of rows) out.set(row.id, toDto(row, skills.get(row.id)));
    return out;
  }

  // Base list projection + joins; order/limit/offset are the caller's to add.
  private selectVacancies(where: SQL | undefined) {
    return this.db
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

        uniqueVacancyId: vacancies.uniqueVacancyId,
        // Badge counters — the surviving row of a multi-member group is the
        // representative (the collapse predicate drops every other member), so
        // "vacancyCount > 1" is both necessary and sufficient here.
        duplicateCount: sql<number | null>`CASE
          WHEN ${uniqueVacancies.vacancyCount} > 1
          THEN ${uniqueVacancies.vacancyCount} ELSE NULL END`,
        duplicateSourceCount: sql<number | null>`CASE
          WHEN ${uniqueVacancies.vacancyCount} > 1
          THEN ${uniqueVacancies.sourceCount} ELSE NULL END`,
      })
      .from(vacancies)
      .innerJoin(sources, eq(sources.id, vacancies.sourceId))
      .innerJoin(rssRecords, eq(rssRecords.id, vacancies.lastRssRecordId))
      .leftJoin(companies, eq(companies.id, vacancies.companyId))
      .leftJoin(roleNode, roleJoin)
      .leftJoin(domainNode, domainJoin)
      .leftJoin(uniqueVacancies, eq(uniqueVacancies.id, vacancies.uniqueVacancyId))
      .where(where);
  }

  /**
   * Resolve the outbound source URL for one vacancy — backs the `/go/:id`
   * apply redirect so digest taps route through metahunt (the seam where click
   * tracking will hang). Returns null for a malformed id, a missing vacancy, or
   * a legacy row with no link.
   */
  async getApplyLink(id: string): Promise<string | null> {
    if (!UUID_REGEX.test(id)) return null;
    const [row] = await this.db
      .select({ link: rssRecords.link })
      .from(vacancies)
      .innerJoin(rssRecords, eq(rssRecords.id, vacancies.lastRssRecordId))
      .where(eq(vacancies.id, id))
      .limit(1);
    return row?.link ?? null;
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

function buildWhere(params: FeedSearchParams): SQL | undefined {
  const conds: SQL[] = [];
  if (params.q) conds.push(ilike(vacancies.title, `%${params.q}%`));
  if (params.sourceId) conds.push(eq(vacancies.sourceId, params.sourceId));
  if (params.roleId) conds.push(eq(vacancies.roleNodeId, params.roleId));
  // Multi-role filter (OR): match any of the listed roles.
  if (params.roleIds && params.roleIds.length > 0) {
    conds.push(inArray(vacancies.roleNodeId, params.roleIds));
  }
  // Multi-domain filter (OR): match any of the listed domains.
  if (params.domainIds && params.domainIds.length > 0) {
    conds.push(inArray(vacancies.domainNodeId, params.domainIds));
  }
  if (params.seniorities?.length) {
    conds.push(inArray(vacancies.seniority, params.seniorities));
  }
  if (params.workFormats?.length) {
    conds.push(inArray(vacancies.workFormat, params.workFormats));
  }
  if (params.englishLevels?.length) {
    conds.push(inArray(vacancies.englishLevel, params.englishLevels));
  }
  if (params.employmentTypes?.length) {
    conds.push(inArray(vacancies.employmentType, params.employmentTypes));
  }
  // Freshness gate — coalesce(published, loaded) mirrors the feed's sort; the
  // day count stays a bound parameter via make_interval.
  if (params.postedWithinDays !== undefined) {
    conds.push(
      sql`coalesce(${vacancies.publishedAt}, ${vacancies.loadedAt}) > now() - make_interval(days => ${params.postedWithinDays})`,
    );
  }
  // Discrete experience buttons (OR): exact tokens + "6+" (≥6). Lenient on NULL
  // — unstated experience always passes; only explicit non-matches are dropped.
  if (params.experienceYears && params.experienceYears.length > 0) {
    const exact = params.experienceYears
      .filter((t) => /^\d+$/.test(t))
      .map(Number);
    const openEnded = params.experienceYears.includes(EXPERIENCE_OPEN_TOKEN);
    const arms: SQL[] = [isNull(vacancies.experienceYears)];
    if (exact.length > 0) arms.push(inArray(vacancies.experienceYears, exact));
    if (openEnded) {
      arms.push(gte(vacancies.experienceYears, EXPERIENCE_OPEN_MIN));
    }
    // No real token → skip, don't collapse the feed to NULL-only rows.
    if (arms.length > 1) conds.push(or(...arms)!);
  }
  // "Without a test task" (false) includes unknowns: a null (unscored) vacancy
  // still counts as "no test", so only a confirmed-true is excluded. Filtering
  // *for* a test task (true) stays strict.
  if (params.hasTestAssignment === true) {
    conds.push(eq(vacancies.hasTestAssignment, true));
  } else if (params.hasTestAssignment === false) {
    conds.push(
      or(
        eq(vacancies.hasTestAssignment, false),
        isNull(vacancies.hasTestAssignment),
      )!,
    );
  }
  if (params.hasReservation !== undefined) {
    conds.push(eq(vacancies.hasReservation, params.hasReservation));
  }
  if (params.loadedAfter) conds.push(gt(vacancies.loadedAt, params.loadedAfter));
  if (params.excludeIds && params.excludeIds.length > 0) {
    conds.push(notInArray(vacancies.id, params.excludeIds));
  }
  if (params.skillIds && params.skillIds.length > 0) {
    // AND semantics: keep only vacancies whose vacancy_nodes set covers
    // every requested skill. One subquery (not N joins) keeps both the
    // list and the count query — which share buildWhere — single-pass.
    // By default a skill must be `required`; the optional-scope toggle drops
    // that gate so nice-to-have links also satisfy the filter.
    const ids = params.skillIds;
    const requiredGate = params.includeOptionalSkills
      ? sql``
      : sql`AND vn.is_required`;
    conds.push(sql`${vacancies.id} IN (
      SELECT vn.vacancy_id
      FROM vacancy_nodes vn
      WHERE vn.node_id IN (${uuidList(ids)})
        ${requiredGate}
      GROUP BY vn.vacancy_id
      HAVING COUNT(DISTINCT vn.node_id) = ${ids.length}
    )`);
  }
  // When includeRoleless is off (default), require the verified role-node
  // join to have matched. The join itself enforces VERIFIED, so this also
  // excludes vacancies whose role is unverified.
  if (params.includeRoleless !== true) conds.push(isNotNull(roleNode.id));
  // "Only duplicates" toggle: restrict to multi-member groups. The collapse
  // predicate below already keeps just the representative row, so this only
  // has to drop singletons and ungrouped vacancies.
  if (params.hasDuplicates === true) {
    conds.push(
      and(
        isNotNull(vacancies.uniqueVacancyId),
        gt(uniqueVacancies.vacancyCount, 1),
      )!,
    );
  }
  // Collapse every dedup group (gold and confirmed alike) to its freshest
  // member. Keeps singletons and ungrouped rows untouched.
  conds.push(isGroupRepresentative);
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

    uniqueVacancyId: row.uniqueVacancyId,
    duplicateCount: row.duplicateCount,
    duplicateSourceCount: row.duplicateSourceCount,
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
