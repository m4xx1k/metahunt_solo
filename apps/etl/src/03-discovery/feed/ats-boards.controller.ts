import { Controller, Get, Inject, Query } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE, type DrizzleDB } from "@metahunt/database";

const UA_MATCH =
  "Ukrain|Kyiv|Kiev|Lviv|Kharkiv|Dnipro|Odesa|Odessa|Україн|Київ|Львів|Харків|Дніпро|Одеса";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type AtsStatus = "open" | "closed" | "all";

export interface AtsJob {
  id: string;
  title: string;
  companyName: string;
  companySlug: string | null;
  atsType: string;
  boardSlug: string | null;
  link: string | null;
  locations: unknown;
  workFormat: "REMOTE" | "OFFICE" | "HYBRID" | null;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryPeriod: "HOUR" | "MONTH" | "YEAR" | null;
  salarySource: "ATS_STRUCTURED" | "LLM_TEXT" | null;
  publishedAt: string | null;
  closedAt: string | null;
  status: "OPEN" | "CLOSED";
  isUa: boolean;
  hasDuplicate: boolean;
  needsReview: boolean;
}

export interface AtsJobsResponse {
  items: AtsJob[];
  total: number;
  limit: number;
  offset: number;
}

interface AtsStatsRow {
  boards: number;
  jobs: number;
  openJobs: number;
  closedJobs: number;
  uaJobs: number;
  remoteJobs: number;
  locationJobs: number;
  workFormatJobs: number;
  salaryJobs: number;
  directUrlJobs: number;
  roleJobs: number;
  duplicateCandidates: number;
}

export interface AtsOverview {
  totals: Omit<
    AtsStatsRow,
    "locationJobs" | "workFormatJobs" | "salaryJobs" | "directUrlJobs" | "roleJobs"
  >;
  fieldCoverage: Array<{ field: string; filled: number; total: number }>;
  problemBoards: Array<{
    name: string;
    atsType: string;
    boardSlug: string | null;
    jobs: number;
    locationJobs: number;
    workFormatJobs: number;
    directUrlJobs: number;
    issue: string;
  }>;
}

// node-postgres returns QueryResult while some drizzle adapters return the
// rows directly. Keeping that compatibility makes the tiny POC server use the
// same controller as the regular ETL app.
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []);
}

function asStatus(raw: string | undefined): AtsStatus {
  return raw === "all" || raw === "closed" ? raw : "open";
}

function boundedNumber(raw: string | undefined, fallback: number, max: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
}

@Controller("ats")
export class AtsBoardsController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Operator-facing posting list. It intentionally serves source-postings,
   * not deduped feed cards: this is where we decide whether a board/job is
   * worth keeping and whether the parser retained the board's facts.
   */
  @Get("jobs")
  async jobs(
    @Query("q") qRaw?: string,
    @Query("status") statusRaw?: string,
    @Query("uaOnly") uaOnlyRaw?: string,
    @Query("remoteOnly") remoteOnlyRaw?: string,
    @Query("reviewOnly") reviewOnlyRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string,
  ): Promise<AtsJobsResponse> {
    const q = qRaw?.trim().slice(0, 160) || undefined;
    const status = asStatus(statusRaw);
    const uaOnly = uaOnlyRaw === "true";
    const remoteOnly = remoteOnlyRaw === "true";
    const reviewOnly = reviewOnlyRaw === "true";
    const limit = boundedNumber(limitRaw, DEFAULT_LIMIT, MAX_LIMIT) || DEFAULT_LIMIT;
    const offset = boundedNumber(offsetRaw, 0, Number.MAX_SAFE_INTEGER);

    const result = await this.db.execute<Record<string, unknown>>(sql`
      select
        v.id,
        v.title,
        coalesce(c.name, s.display_name) as "companyName",
        c.slug as "companySlug",
        s.ats_type::text as "atsType",
        s.ats_slug as "boardSlug",
        r.link,
        v.locations,
        v.work_format as "workFormat",
        v.seniority,
        v.salary_min as "salaryMin",
        v.salary_max as "salaryMax",
        v.currency::text as currency,
        v.salary_period::text as "salaryPeriod",
        v.salary_source::text as "salarySource",
        v.published_at as "publishedAt",
        v.closed_at as "closedAt",
        case when v.closed_at is null then 'OPEN' else 'CLOSED' end as status,
        (v.locations::text ~* ${UA_MATCH}) as "isUa",
        (v.unique_vacancy_id is not null) as "hasDuplicate",
        (
          v.locations is null or v.locations = '[]'::jsonb or
          v.work_format is null or
          r.link is null or r.link = '' or
          v.role_node_id is null
        ) as "needsReview",
        count(*) over()::int as total
      from vacancies v
      join sources s on s.id = v.source_id and s.kind = 'ats'
      join rss_records r on r.id = v.last_rss_record_id
      left join companies c on c.id = v.company_id
      where true
        ${status === "open" ? sql`and v.closed_at is null` : sql``}
        ${status === "closed" ? sql`and v.closed_at is not null` : sql``}
        ${uaOnly ? sql`and v.locations::text ~* ${UA_MATCH}` : sql``}
        ${remoteOnly ? sql`and v.work_format = 'REMOTE'` : sql``}
        ${
          reviewOnly
            ? sql`
          and (
            v.locations is null or v.locations = '[]'::jsonb or
            v.work_format is null or r.link is null or r.link = '' or v.role_node_id is null
          )
        `
            : sql``
        }
        ${q ? sql`and (v.title ilike ${`%${q}%`} or coalesce(c.name, s.display_name) ilike ${`%${q}%`})` : sql``}
      order by v.closed_at is null desc, v.published_at desc nulls last, v.loaded_at desc
      limit ${limit} offset ${offset}
    `);

    const values = rowsOf<AtsJob & { total: number }>(result);
    const total = Number(values[0]?.total ?? 0);
    return {
      items: values.map((row) => {
        const { total: windowCount, ...item } = row;
        void windowCount;
        return item;
      }),
      total,
      limit,
      offset,
    };
  }

  /** Small, global health summary. It is deliberately not affected by list
   * filters, so an operator can tell a genuinely empty result from a bad API
   * response or a weak board even while narrowing the list. */
  @Get("overview")
  async overview(): Promise<AtsOverview> {
    const statsResult = await this.db.execute<Record<string, unknown>>(sql`
      select
        count(distinct s.id)::int as boards,
        count(v.id)::int as jobs,
        count(v.id) filter (where v.closed_at is null)::int as "openJobs",
        count(v.id) filter (where v.closed_at is not null)::int as "closedJobs",
        count(v.id) filter (where v.locations::text ~* ${UA_MATCH})::int as "uaJobs",
        count(v.id) filter (where v.work_format = 'REMOTE')::int as "remoteJobs",
        count(v.id) filter (where v.locations is not null and v.locations <> '[]'::jsonb)::int as "locationJobs",
        count(v.id) filter (where v.work_format is not null)::int as "workFormatJobs",
        count(v.id) filter (where v.salary_min is not null or v.salary_max is not null)::int as "salaryJobs",
        count(v.id) filter (where r.link is not null and r.link <> '')::int as "directUrlJobs",
        count(v.id) filter (where v.role_node_id is not null)::int as "roleJobs",
        count(v.id) filter (where v.unique_vacancy_id is not null)::int as "duplicateCandidates"
      from sources s
      left join vacancies v on v.source_id = s.id
      left join rss_records r on r.id = v.last_rss_record_id
      where s.kind = 'ats'
    `);
    const stats = rowsOf<AtsStatsRow>(statsResult)[0] ?? {
      boards: 0,
      jobs: 0,
      openJobs: 0,
      closedJobs: 0,
      uaJobs: 0,
      remoteJobs: 0,
      locationJobs: 0,
      workFormatJobs: 0,
      salaryJobs: 0,
      directUrlJobs: 0,
      roleJobs: 0,
      duplicateCandidates: 0,
    };

    const problemResult = await this.db.execute<Record<string, unknown>>(sql`
      with board_stats as (
        select
          s.display_name as name,
          s.ats_type::text as "atsType",
          s.ats_slug as "boardSlug",
          count(v.id)::int as jobs,
          count(v.id) filter (where v.locations is not null and v.locations <> '[]'::jsonb)::int as "locationJobs",
          count(v.id) filter (where v.work_format is not null)::int as "workFormatJobs",
          count(v.id) filter (where r.link is not null and r.link <> '')::int as "directUrlJobs"
        from sources s
        left join vacancies v on v.source_id = s.id
        left join rss_records r on r.id = v.last_rss_record_id
        where s.kind = 'ats'
        group by s.id
      )
      select *,
        case
          when jobs = 0 then 'no imported jobs'
          when "directUrlJobs" < jobs then 'missing original URLs'
          when "locationJobs" * 100 < jobs * 60 then 'weak location coverage'
          when "workFormatJobs" * 100 < jobs * 60 then 'weak work-mode coverage'
          else 'review board freshness'
        end as issue
      from board_stats
      order by
        (jobs = 0) desc,
        ("directUrlJobs"::float / nullif(jobs, 0)) asc nulls first,
        ("locationJobs"::float / nullif(jobs, 0)) asc nulls first,
        jobs desc
      limit 8
    `);

    const total = Number(stats.jobs);
    return {
      totals: {
        boards: Number(stats.boards),
        jobs: total,
        openJobs: Number(stats.openJobs),
        closedJobs: Number(stats.closedJobs),
        uaJobs: Number(stats.uaJobs),
        remoteJobs: Number(stats.remoteJobs),
        duplicateCandidates: Number(stats.duplicateCandidates),
      },
      fieldCoverage: [
        { field: "location", filled: Number(stats.locationJobs), total },
        { field: "work mode", filled: Number(stats.workFormatJobs), total },
        { field: "salary", filled: Number(stats.salaryJobs), total },
        { field: "original URL", filled: Number(stats.directUrlJobs), total },
        { field: "classified role", filled: Number(stats.roleJobs), total },
      ],
      problemBoards: rowsOf<AtsOverview["problemBoards"][number]>(problemResult),
    };
  }
}
