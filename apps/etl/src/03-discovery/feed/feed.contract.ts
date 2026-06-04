/**
 * Wire contract for the feed (vacancy search) HTTP API.
 *
 * Kept free of NestJS / Drizzle / runtime imports so the web client can import
 * these types directly without pulling in server dependencies.
 *
 * Shape rationale: the consumer is the silver vacancy card. It needs *resolved*
 * values (company name, role name, skill names, source display name, source
 * URL) — not opaque FK ids — so the API joins them server-side and ships refs.
 */

// Enums + NodeRef live in shared/contract (used by feed, market, tracks).
// Re-exported so the web client can mirror the full feed contract from here.
import { SENIORITY_VALUES, WORK_FORMAT_VALUES } from "../../platform/shared/contract";
import type {
  Currency,
  EmploymentType,
  EngagementType,
  EnglishLevel,
  NodeRef,
  Seniority,
  WorkFormat,
} from "../../platform/shared/contract";

export { SENIORITY_VALUES, WORK_FORMAT_VALUES };
export type {
  Currency,
  EmploymentType,
  EngagementType,
  EnglishLevel,
  NodeRef,
  Seniority,
  WorkFormat,
};

// ───────────────────────── Resolved refs ─────────────────────────

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

// ─────────────────────── Search endpoint ───────────────────────
// The single feed query: filters + pagination. The reusable language every
// consumer speaks — HTTP, and (in-process) future TG bot / alerts / saved
// searches that inject FeedService directly.

export interface FeedQuery {
  /** 1-based page index. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 20, max 100. */
  pageSize?: number;

  /** Free-text search over `title` (ILIKE). */
  q?: string;

  sourceId?: string;
  companyId?: string;
  roleId?: string;
  /** Match vacancies whose role is ANY of these ROLE node ids (OR semantics). */
  roleIds?: string[];
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

  /** Tri-state: true/false filters on a known value; undefined = no filter. */
  hasTestAssignment?: boolean;
  hasReservation?: boolean;

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

export interface FeedResponse {
  items: VacancyDto[];
  page: number;
  pageSize: number;
  /** Total matching rows across all pages. */
  total: number;
}

// ─────────────────────────── Facets ───────────────────────────
// Full verified facet lists for the filter sidebar's search — every VERIFIED
// ROLE / SKILL node over the eligible vacancy set (not the topN the market
// snapshot ships), so search/add covers the whole catalog.

export interface NodeFacet {
  id: string;
  name: string;
  count: number;
}

export interface RoleFacetsResponse {
  roles: NodeFacet[];
}

export interface SkillFacetsResponse {
  skills: NodeFacet[];
}
