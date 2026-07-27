// Wire types + fetcher for vacancies taken straight from a company's own ATS.
// Source of truth: apps/etl/src/03-discovery/feed/ats-boards.controller.ts.
// Hand-mirrored per ADR-0005.

import { apiGet, buildQs } from "./client";

export interface AtsBoardVacancy {
  id: string;
  title: string;
  seniority: string | null;
  workFormat: string | null;
  locations: unknown;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  /** ATS_STRUCTURED = the employer stated it. LLM_TEXT = we read it out of prose. */
  salarySource: "ATS_STRUCTURED" | "LLM_TEXT" | null;
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

export interface AtsCompaniesResponse {
  companies: AtsBoardCompany[];
  totals: { companies: number; vacancies: number; uaVacancies: number };
}

export const atsApi = {
  companies: (params: { perCompany?: number; uaOnly?: boolean } = {}) =>
    apiGet<AtsCompaniesResponse>(
      `/ats/companies${buildQs({
        perCompany: params.perCompany,
        uaOnly: params.uaOnly ? "true" : undefined,
      })}`,
    ),
};
