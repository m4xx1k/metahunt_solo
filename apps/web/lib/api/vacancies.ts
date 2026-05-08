// Web-side wire types + fetcher for the silver vacancies API.
// Source of truth: apps/etl/src/vacancies/vacancies.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

// ───────────────────────────── Enums ─────────────────────────────

export type Seniority =
  | "INTERN"
  | "JUNIOR"
  | "MIDDLE"
  | "SENIOR"
  | "LEAD"
  | "PRINCIPAL"
  | "C_LEVEL";

export type WorkFormat = "REMOTE" | "OFFICE" | "HYBRID";

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

function buildQs(params?: ListVacanciesQuery): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, String(item));
      continue;
    }
    if (
      typeof v !== "string" &&
      typeof v !== "number" &&
      typeof v !== "boolean"
    ) {
      continue;
    }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function get<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`vacancies api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const vacanciesApi = {
  list: (q: ListVacanciesQuery = {}) =>
    get<ListVacanciesResponse>(`/vacancies${buildQs(q)}`),
};
