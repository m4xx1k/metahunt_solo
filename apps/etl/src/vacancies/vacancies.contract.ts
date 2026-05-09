/**
 * Wire contract for the vacancies HTTP API.
 *
 * Kept free of NestJS / Drizzle / runtime imports so the web client can
 * import these types directly without pulling in server dependencies.
 *
 * Shape rationale: the consumer is the silver vacancy card (sibling of
 * `apps/web/app/(landing)/_components/result/GoldenJobCard.tsx`). That UI
 * needs *resolved* values (company name, role name, skill names, source
 * display name, source URL) — not opaque FK ids — so the API joins them
 * server-side and ships refs.
 */

// ───────────────────────────── Enums ─────────────────────────────
// Mirror the pgEnums in libs/database/src/schema/vacancies.ts.

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
// Server resolves FKs to {id, name}-shaped refs so the UI never has to
// do a second round-trip just to render a label.

export interface NodeRef {
  id: string;
  /** `nodes.canonical_name` — already humanized at ingest time. */
  name: string;
}

export interface CompanyRef {
  id: string;
  name: string;
  slug: string;
}

export interface SourceRef {
  id: string;
  /** Stable machine code (e.g. `djinni`, `dou`). */
  code: string;
  /** Human label for "apply on …" rows. */
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
  /** Source-scoped id (slug/url path on the origin site). Useful for debugging + dedupe. */
  externalId: string;
  /**
   * `rss_records.id` of the most recent record this vacancy was loaded from.
   * Drives the operator-facing "view source record" link on the vacancy card.
   */
  rssRecordId: string;

  source: SourceRef;
  /** Origin URL — drives the "apply on" CTA. May be null on legacy rows. */
  link: string | null;
  /** ISO-8601. From the RSS item; what the card shows as "posted X ago". */
  publishedAt: string | null;
  /** ISO-8601. When the loader first wrote this vacancy. */
  loadedAt: string;
  /** ISO-8601. Last time the loader rewrote this vacancy. */
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
  /** Always an array; empty when extraction found no locations. */
  locations: string[];
}

// ───────────────────────── List endpoint ─────────────────────────

export interface ListVacanciesQuery {
  /** 1-based page index. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 20, max 100. */
  pageSize?: number;

  /** Free-text search over `title` (ILIKE). */
  q?: string;

  sourceId?: string;
  companyId?: string;
  roleId?: string;
  /** Match vacancies that have ALL listed skills (AND semantics). */
  skillIds?: string[];

  seniority?: Seniority;
  workFormat?: WorkFormat;
  employmentType?: EmploymentType;
  englishLevel?: EnglishLevel;
  engagementType?: EngagementType;

  /** Lower bound on `experienceYears` (inclusive). */
  experienceMin?: number;
  /** Upper bound on `experienceYears` (inclusive). */
  experienceMax?: number;

  /** Vacancies whose `salaryMax` >= this (in `currency`). */
  salaryFloor?: number;
  currency?: Currency;

  /**
   * When false (default), exclude vacancies that lack a VERIFIED role.
   * When true, also surface vacancies whose role is null or unverified
   * (those rows ship with `role: null`).
   */
  includeRoleless?: boolean;
  /**
   * When false (default), only VERIFIED skills are returned in the
   * `skills.required` / `skills.optional` arrays. When true, every linked
   * skill is returned regardless of status.
   */
  includeAllSkills?: boolean;
}

export interface ListVacanciesResponse {
  items: VacancyDto[];
  page: number;
  pageSize: number;
  /** Total matching rows across all pages. */
  total: number;
}

// ─────────────────────── Aggregates endpoint ───────────────────────
// Global market aggregates over the eligible vacancy set (same default
// as `list`: only vacancies with a VERIFIED role node). Powers the
// public market-snapshot hero — see md/journal/migrations/market-snapshot.md.

export interface AggregateSourceCount {
  id: string;
  code: string;
  displayName: string;
  count: number;
}

export interface AggregateSkillCount {
  id: string;
  name: string;
  count: number;
}

/**
 * Same shape regardless of whether it's the global aggregate or scoped
 * to a single source. Omits `sources` (which is a global-only directory).
 */
export interface AggregatesPerSource {
  total: number;
  /** ISO-8601. max(loaded_at) over the eligible set. Null if empty. */
  lastSyncAt: string | null;
  /** Up to 10 entries; consumer renders top 8. VERIFIED skills only. */
  topSkills: AggregateSkillCount[];
  /** Up to 6 entries. Roles are always VERIFIED via the eligibility rule. */
  topRoles: AggregateSkillCount[];
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;
  /** Count where `has_reservation IS NOT NULL` — denominator for the share. */
  reservationKnownCount: number;
  /** Count where `has_reservation = true`. */
  reservationTrueCount: number;
  /** Count where salary_min OR salary_max is present. */
  salaryDisclosedCount: number;
}

export interface VacancyAggregatesResponse extends AggregatesPerSource {
  sources: AggregateSourceCount[];
  /**
   * Per-source breakdown keyed by `sources[].code` (e.g. `djinni`, `dou`).
   * Each value carries the same shape as the global aggregate so the UI
   * can swap data slices without changing widget contracts.
   */
  bySource: Record<string, AggregatesPerSource>;
}
