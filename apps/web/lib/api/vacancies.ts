// Web-side wire types + fetcher for the silver vacancy feed (GET /feed).
// Source of truth: apps/etl/src/feed/feed.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

import { apiGet, buildQs } from "./client";
// FitTier/MatchSort live in ranking.ts, which already imports VacancyDto from
// here — a type-only import back is fine (erased at compile time, no runtime
// cycle) and avoids a second copy of the tier union.
import type { FitTier } from "./ranking";
import type { ListVacanciesQuery } from "./filters";

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

export function coerceBool(v: string | undefined): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

// Comma-joined enum list from the URL → validated values (unknowns dropped, so a
// bad ?seniorities=foo degrades to "no filter" rather than 400-ing the page).
export function coerceEnumList<T extends string>(values: readonly T[], v: string | undefined): T[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (values as readonly string[]).includes(s));
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

export type EngagementType = "PRODUCT" | "OUTSOURCE" | "OUTSTAFF" | "STARTUP" | "AGENCY";

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

/** A required skill, plus the choice it belongs to. Members sharing a `group`
 *  are alternatives — any one of them satisfies the requirement. */
export interface RequirementRef extends NodeRef {
  group?: number;
}

export interface VacancySkills {
  required: RequirementRef[];
  // Never grouped — only required skills enter coverage.
  optional: NodeRef[];
}

export interface VacancySalary {
  min: number | null;
  max: number | null;
  currency: Currency | null;
}

// The viewer's personalized Fit overlay — null for an anonymous visitor, one
// with no CV, or nothing scored for this vacancy. See unified-feed-score.md:
// "A Fit score is optional data attached to a vacancy card, not a different
// endpoint."
export interface MatchOverlay {
  relevance: number;
  coverage: number;
  tier: FitTier;
  percent: number;
  onStack: boolean;
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
  /** Group size — non-null ONLY on the representative card of a multi-member group. */
  duplicateCount: number | null;
  /** Distinct sources in that group; non-null on the same rows as `duplicateCount`. */
  duplicateSourceCount: number | null;

  match: MatchOverlay | null;
}

// The viewer's own resolved skills, verbatim — same role as
// `ListVacanciesResponse.viewerSkills` below. The vacancy detail page's
// ✅/❌/➕ diff is computed client-side (entities/vacancy/skill-diff.ts) from
// these plus `skills.required`/`.optional`, one implementation shared with
// every list card instead of a server copy and a client copy.
export interface VacancyDetailDto extends VacancyDto {
  viewerSkills: NodeRef[] | null;
}

// ─────────────────────── Dedup group (drawer) ──────────────────────
// Mirror of apps/etl/src/02-enrich/dedup/dedup.contract.ts. The "why merged"
// reasons shown when a duplicate badge is expanded.

export type DedupRule = "exact" | "repost" | "cross_source";

export interface DedupReason {
  rule: DedupRule;
  matchedAgainstVacancyId: string;
  titleSim: number;
  containment: number;
  cosine: number | null;
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
  /** null on the member that founded the group. */
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

// The query shape lives in filters.ts, split into composable axes (a type-only
// import back is fine — erased at compile time, same as ranking.ts above).
export type { ListVacanciesQuery, SubscriptionFilter, VacancyFilter } from "./filters";

export interface ListVacanciesResponse {
  items: VacancyDto[];
  page: number;
  pageSize: number;
  total: number;
  /** FULL PATH + off-stack hidden (the default) only: 0 on the cheap path. */
  offStackHidden: number;
  /**
   * The scored viewer's own resolved skills — present when a card could carry
   * `match` (signed-in CV or allowlisted `sample`), absent/null otherwise.
   * Lets the cold card compute the ✅/❌/➕ skill diff per card with no
   * per-card request, like the warm lens's `MatchResponse.resolved.matched`.
   */
  viewerSkills?: NodeRef[] | null;
}

// ─────────────────────────── Fetcher ────────────────────────────

export const vacanciesApi = {
  list: (q: ListVacanciesQuery = {}) => apiGet<ListVacanciesResponse>(`/feed${buildQs(q)}`),
  /** Members + "why merged" reasons for one dedup group (the badge drawer). */
  group: (uniqueVacancyId: string) => apiGet<FeedDuplicateGroup>(`/feed/group/${uniqueVacancyId}`),
  /** Full detail for one vacancy, including `description` (the public detail page). */
  byId: (vacancyId: string, init?: RequestInit) =>
    apiGet<VacancyDetailDto>(`/feed/vacancy/${vacancyId}`, init),
};
