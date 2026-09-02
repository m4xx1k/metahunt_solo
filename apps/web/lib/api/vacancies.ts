// Web-side wire types + fetcher for the silver vacancy feed (GET /feed).
// Source of truth: apps/etl/src/feed/feed.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

import { apiGet, buildQs } from "./client";
// FitTier/MatchSort live in ranking.ts, which already imports VacancyDto from
// here — a type-only import back is fine (erased at compile time, no runtime
// cycle) and avoids a second copy of the tier union.
import type { FitTier, MatchSort } from "./ranking";

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

export interface VacancySkills {
  required: NodeRef[];
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

// The ✅/❌/➕ skill diff on the vacancy detail page — computed server-side
// from the vacancy's own skills + the viewer's, no weight (nothing here
// ranks skills against each other, unlike the warm-lens `RankedVacancy.diff`).
export interface VacancySkillDiff {
  have: NodeRef[];
  missing: NodeRef[];
  bonus: NodeRef[];
}

export interface VacancyDetailDto extends VacancyDto {
  diff: VacancySkillDiff | null;
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
  /** Hiring company slug — resolved to an id at the feed boundary. */
  companySlug?: string;
  roleId?: string;
  /**
   * Match ANY of these ROLE node slugs (OR). With `trackSlug` it overrides the
   * track's role axis (lazy-refine to specific roles) while the track's skill
   * preset still applies. Serialized as repeated ?roleIds= params; the feed
   * controller resolves slugs -> node ids at the boundary.
   */
  roleIds?: string[];
  skillIds?: string[];
  excludedSkillIds?: string[];
  /** Match ANY of these DOMAIN node slugs (OR). Serialized as repeated ?domainIds=. */
  domainIds?: string[];
  /**
   * Skill-match scope. Omitted/false: a skill matches only when it's a
   * required (must-have) skill on the vacancy. true: nice-to-have skills also
   * satisfy the filter.
   */
  includeOptionalSkills?: boolean;
  /** Match ANY listed value (OR). Serialized as repeated params. */
  seniorities?: Seniority[];
  workFormats?: WorkFormat[];
  employmentTypes?: EmploymentType[];
  englishLevels?: EnglishLevel[];
  engagementType?: EngagementType;
  /** Discrete experience tokens ("0".."5" exact, "6+" = ≥6); OR-combined. */
  experienceYears?: string[];
  salaryFloor?: number;
  currency?: Currency;
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
  /** Freshness gate — posted within the last N days. */
  postedWithinDays?: number;
  /** When true, show ONLY deduped vacancies (representative card of a multi-member group). */
  hasDuplicates?: boolean;

  /** When false (default), exclude vacancies that lack a VERIFIED role. */
  includeRoleless?: boolean;
  /** When false (default), only VERIFIED skills appear in `skills`. */
  includeAllSkills?: boolean;

  /**
   * Page order: freshest (default, the CHEAP PATH) or best-Fit-first (the
   * FULL PATH — needs a signed-in CV or `sample`; without one it silently
   * stays freshest, same result set).
   */
  sort?: MatchSort;
  /** Hide vacancies below this coverage tier. Forces the FULL PATH, same as sort=score. */
  minFitTier?: FitTier;
  /** FULL PATH only — off-stack hiding is a warm-lens affordance the cheap path never had. */
  includeOffStack?: boolean;
  /** A seeded sample candidate id — scores the page against it like a signed-in viewer's CV. */
  sample?: string;
}

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
