// Web-side wire types + fetcher for the silver vacancies API.
// Source of truth: apps/etl/src/vacancies/vacancies.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

import { apiGet, buildQs } from "./client";

// ───────────────────────────── Enums ─────────────────────────────

export const SENIORITY_VALUES = [
  "INTERN",
  "JUNIOR",
  "MIDDLE",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
  "C_LEVEL",
] as const;
export type Seniority = (typeof SENIORITY_VALUES)[number];

export const WORK_FORMAT_VALUES = ["REMOTE", "OFFICE", "HYBRID"] as const;
export type WorkFormat = (typeof WORK_FORMAT_VALUES)[number];

// URL/query params are user-controlled, so a bad ?seniority=foo must
// degrade to "no filter", not a 400 that blanks the page. The backend
// still validates as defense in depth.
export function coerceSeniority(v: string | undefined): Seniority | undefined {
  return SENIORITY_VALUES.find((s) => s === v);
}

export function coerceWorkFormat(
  v: string | undefined,
): WorkFormat | undefined {
  return WORK_FORMAT_VALUES.find((w) => w === v);
}

export function coerceBool(v: string | undefined): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "FREELANCE"
  | "INTERNSHIP";

export type EnglishLevel =
  | "BEGINNER"
  | "INTERMEDIATE"
  | "UPPER_INTERMEDIATE"
  | "ADVANCED"
  | "NATIVE";

export type Currency = "USD" | "EUR" | "UAH";

export type EngagementType =
  | "PRODUCT"
  | "OUTSOURCE"
  | "OUTSTAFF"
  | "STARTUP"
  | "AGENCY";

// ───────────────────────── Resolved refs ─────────────────────────

export interface NodeRef {
  id: string;
  name: string;
}

export interface CompanyRef {
  id: string;
  name: string;
  slug: string;
}

export interface SourceRef {
  id: string;
  code: string;
  displayName: string;
}

export interface VacancySkills {
  required: NodeRef[];
  optional: NodeRef[];
}

export interface VacancySalary {
  min: number | null;
  max: number | null;
  currency: Currency | null;
}

// ─────────────────────────── Vacancy DTO ─────────────────────────

export interface VacancyDto {
  id: string;
  externalId: string;
  /** rss_records.id of the most recent record this vacancy was loaded from. */
  rssRecordId: string;

  source: SourceRef;
  link: string | null;
  publishedAt: string | null;
  loadedAt: string;
  updatedAt: string;

  title: string;
  description: string | null;

  company: CompanyRef | null;
  role: NodeRef | null;
  domain: NodeRef | null;
  skills: VacancySkills;

  seniority: Seniority | null;
  workFormat: WorkFormat | null;
  employmentType: EmploymentType | null;
  englishLevel: EnglishLevel | null;
  experienceYears: number | null;
  engagementType: EngagementType | null;

  hasTestAssignment: boolean | null;
  hasReservation: boolean | null;

  salary: VacancySalary;
  locations: string[];
}

// ───────────────────────── List endpoint ─────────────────────────

export interface ListVacanciesQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sourceId?: string;
  companyId?: string;
  roleId?: string;
  skillIds?: string[];
  seniority?: Seniority;
  workFormat?: WorkFormat;
  employmentType?: EmploymentType;
  englishLevel?: EnglishLevel;
  engagementType?: EngagementType;
  experienceMin?: number;
  experienceMax?: number;
  salaryFloor?: number;
  currency?: Currency;
  hasTestAssignment?: boolean;
  hasReservation?: boolean;

  /**
   * Browse-tree selection. Resolves to the track's criteria server-side and
   * coexists with raw roleId/skillIds (lazy-refine: once the user edits, the
   * page sends explicit ids instead). See taxonomy-navigation.md.
   */
  trackSlug?: string;

  /** When false (default), exclude vacancies that lack a VERIFIED role. */
  includeRoleless?: boolean;
  /** When false (default), only VERIFIED skills appear in `skills`. */
  includeAllSkills?: boolean;
}

export interface ListVacanciesResponse {
  items: VacancyDto[];
  page: number;
  pageSize: number;
  total: number;
}

// ─────────────────────────── Fetcher ────────────────────────────

export const vacanciesApi = {
  list: (q: ListVacanciesQuery = {}) =>
    apiGet<ListVacanciesResponse>(`/vacancies${buildQs(q)}`),
};
