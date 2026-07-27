import { Controller, Get, Inject, Query } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE, type DrizzleDB } from "@metahunt/database";

export interface AtsBoardVacancy {
  id: string;
  slug: string | null;
  title: string;
  seniority: string | null;
  workFormat: string | null;
  locations: unknown;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  /** 'ATS_STRUCTURED' means the employer stated it; 'LLM_TEXT' means we read it. */
  salarySource: string | null;
  publishedAt: string | null;
}

export interface AtsBoardCompany {
  companyId: string | null;
  name: string;
  slug: string | null;
  atsType: string;
  boardSlug: string | null;
  total: number;
  uaCount: number;
  statedSalaryCount: number;
  vacancies: AtsBoardVacancy[];
}

const UA_MATCH = "Ukrain|Kyiv|Kiev|Lviv|Kharkiv|Dnipro|Odesa|Україн|Київ|Львів";

@Controller("ats")
export class AtsBoardsController {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // Companies that publish on their own ATS, each with a preview of its open
  // roles. One round trip: a per-company request would be N+1 against a list
  // that is already the page.
  @Get("companies")
  async companies(
    @Query("perCompany") perCompanyRaw?: string,
    @Query("uaOnly") uaOnly?: string,
  ): Promise<{ companies: AtsBoardCompany[]; totals: Record<string, number> }> {
    const perCompany = Math.min(Math.max(Number(perCompanyRaw) || 6, 1), 50);
    const uaFilter = uaOnly === "true";

    const rows = await this.db.execute<AtsBoardCompany>(sql`
      with ats_vacancies as (
        select
          v.id, v.title, v.seniority, v.work_format, v.locations,
          v.salary_min, v.salary_max, v.currency, v.salary_source, v.published_at,
          v.company_id,
          coalesce(c.name, s.display_name) as company_name,
          c.slug as company_slug,
          s.ats_type, s.ats_slug,
          (v.locations::text ~* ${UA_MATCH}) as is_ua
        from vacancies v
        join sources s on s.id = v.source_id and s.kind = 'ats'
        left join companies c on c.id = v.company_id
        where v.closed_at is null
      ),
      ranked as (
        select *, row_number() over (
          partition by company_name order by published_at desc nulls last
        ) as rn
        from ats_vacancies
        ${uaFilter ? sql`where is_ua` : sql``}
      )
      select
        max(company_id::text) as "companyId",
        company_name as name,
        max(company_slug) as slug,
        max(ats_type::text) as "atsType",
        max(ats_slug) as "boardSlug",
        count(*)::int as total,
        count(*) filter (where is_ua)::int as "uaCount",
        count(*) filter (where salary_source = 'ATS_STRUCTURED')::int as "statedSalaryCount",
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', id, 'title', title, 'seniority', seniority,
              'workFormat', work_format, 'locations', locations,
              'salaryMin', salary_min, 'salaryMax', salary_max,
              'currency', currency, 'salarySource', salary_source,
              'publishedAt', published_at
            ) order by published_at desc nulls last
          ) filter (where rn <= ${perCompany}),
          '[]'::jsonb
        ) as vacancies
      from ranked
      group by company_name
      order by count(*) filter (where is_ua) desc, count(*) desc
    `);

    // node-postgres hands back a QueryResult; older drizzle drivers hand back
    // the rows directly.
    const companies: AtsBoardCompany[] = Array.isArray(rows) ? rows : rows.rows;
    return {
      companies,
      totals: {
        companies: companies.length,
        vacancies: companies.reduce((sum, c) => sum + Number(c.total), 0),
        uaVacancies: companies.reduce((sum, c) => sum + Number(c.uaCount ?? 0), 0),
      },
    };
  }
}
