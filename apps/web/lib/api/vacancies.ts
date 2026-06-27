// Web-side wire types + fetcher for the silver vacancy feed (GET /feed).
// Source of truth: apps/etl/src/feed/feed.contract.ts.
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

export const EMPLOYMENT_TYPE_VALUES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "FREELANCE",
  "INTERNSHIP",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPE_VALUES)[number];

export const ENGLISH_LEVEL_VALUES = [
  "BEGINNER",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
  "NATIVE",
] as const;
export type EnglishLevel = (typeof ENGLISH_LEVEL_VALUES)[number];

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

  /** Dedup group id (`unique_vacancies.id`), or null. Drives the "show group" drawer. */
  uniqueVacancyId: string | null;
  /** Group size — non-null ONLY on the canonical card of a collapsed gold group (>1). */
  duplicateCount: number | null;
  /** Distinct sources in that group; non-null on the same rows as `duplicateCount`. */
  duplicateSourceCount: number | null;
}

// ─────────────────────── Dedup group (drawer) ──────────────────────
// Mirror of apps/etl/src/02-enrich/dedup/dedup.contract.ts. The "why merged"
// reasons shown when a duplicate badge is expanded.

export type DedupConfidence = "gold" | "confirmed";

export interface DedupReason {
  /** Cosine similarity at decision time (0..1). */
  similarity: number;
  matchedAgainstVacancyId: string;
  prefilterMatches: {
    role: boolean | null;
    seniority: boolean | null;
    workFormat: boolean | null;
    company: boolean | null;
    dateWindowDays: number;
  };
  confidence: DedupConfidence;
  corroboration: {
    /** Jaccard over required-skill ids (0..1). */
    skillJaccard: number;
    /** Jaccard over normalised title tokens (0..1). */
    titleJaccard: number;
    companyMatch: boolean;
  };
  embeddingModel: string;
  decidedAt: string;
}

export interface DedupGroupMember {
  vacancyId: string;
  source: SourceRef;
  externalId: string;
  externalUrl: string | null;
  title: string;
  publishedAt: string | null;
  isCanonical: boolean;
  /** Similarity to group centroid; null on the canonical member. */
  similarityToCentroid: number | null;
  /** null on the canonical member. */
  dedupReason: DedupReason | null;
}

export interface FeedDuplicateGroup {
  id: string;
  canonicalVacancyId: string;
  vacancyCount: number;
  sourceCount: number;
  members: DedupGroupMember[];
}

// ───────────────────────── List endpoint ─────────────────────────

export interface ListVacanciesQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sourceId?: string;
  companyId?: string;
  roleId?: string;
  /**
   * Match ANY of these ROLE node ids (OR). With `trackSlug` it overrides the
   * track's role axis (lazy-refine to specific roles) while the track's skill
   * preset still applies. Serialized as repeated ?roleIds= params.
   */
  roleIds?: string[];
  skillIds?: string[];
  /** Match ANY of these DOMAIN node ids (OR). Serialized as repeated ?domainIds=. */
  domainIds?: string[];
  /**
   * Skill-match scope. Omitted/false: a skill matches only when it's a
   * required (must-have) skill on the vacancy. true: nice-to-have skills also
   * satisfy the filter.
   */
  includeOptionalSkills?: boolean;
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
  /** When true, show ONLY deduped vacancies (canonical card of a collapsed gold group). */
  hasDuplicates?: boolean;

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
    apiGet<ListVacanciesResponse>(`/feed${buildQs(q)}`),
  /** Members + "why merged" reasons for one dedup group (the badge drawer). */
  group: (uniqueVacancyId: string) =>
    apiGet<FeedDuplicateGroup>(`/feed/group/${uniqueVacancyId}`),
};
