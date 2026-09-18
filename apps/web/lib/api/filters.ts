// The vacancy query, split into the axes that actually differ between the
// things that consume it. Mirrors apps/etl/src/platform/shared/filter-params.dto.ts
// (hand-mirrored per ADR-0005). Each consumer composes the pieces it honours,
// so nothing has to inherit a superset and omit the rest.

import type { FitTier, MatchSort } from "./ranking";
import type {
  Currency,
  EmploymentType,
  EngagementType,
  EnglishLevel,
  Seniority,
  WorkFormat,
} from "./vacancies";

/** Narrows which vacancies match. Every consumer honours all of it. */
export interface VacancyFilter {
  sourceId?: string;
  /** ROLE slugs, OR-combined. */
  roleIds?: string[];
  /** DOMAIN slugs, OR-combined. */
  domainIds?: string[];
  /** SKILL slugs a returned vacancy must not require. */
  excludedSkillIds?: string[];
  seniorities?: Seniority[];
  workFormats?: WorkFormat[];
  englishLevels?: EnglishLevel[];
  employmentTypes?: EmploymentType[];
  /** Experience tokens ("0".."5" exact, "6+" = ≥6), OR-combined. */
  experienceYears?: string[];
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
}

/**
 * Must-have skills, stated explicitly. Its own axis because CV matching has no
 * equivalent: a CV already declares the skills it is ranked on, so only a
 * browsed or subscribed filter names them.
 */
export interface SkillFilter {
  /** SKILL slugs. All must match unless `includeOptionalSkills`. */
  skillIds?: string[];
}

/**
 * How far back to look. Browsing only: a digest's window is the later of the
 * subscription's own createdAt and the scan floor, so a stored freshness would
 * either duplicate that or silently fight it.
 */
export interface FreshnessFilter {
  postedWithinDays?: number;
}

/** Transport-only. Never persisted — a digest has no pages. */
export interface Pagination {
  page?: number;
  pageSize?: number;
}

/** Ordering and the score gate. Both need a scorer (a signed-in CV or `sample`). */
export interface Ranking {
  sort?: MatchSort;
  minFitTier?: FitTier;
  includeOffStack?: boolean;
}

/** Affordances that only make sense while browsing a page of results. */
export interface FeedBrowsing {
  q?: string;
  roleId?: string;
  companyId?: string;
  companySlug?: string;
  salaryFloor?: number;
  currency?: Currency;
  engagementType?: EngagementType;
  hasDuplicates?: boolean;
  includeOptionalSkills?: boolean;
  includeRoleless?: boolean;
  includeAllSkills?: boolean;
  /** A seeded sample candidate id — scores the page like a signed-in viewer's CV. */
  sample?: string;
}

/** GET /feed. */
export type ListVacanciesQuery = VacancyFilter &
  SkillFilter &
  FreshnessFilter &
  Pagination &
  Ranking &
  FeedBrowsing;

/**
 * What a subscription is. Paging, ranking, freshness and browsing are absent by
 * composition rather than omitted after the fact — see each axis for why.
 * A CV subscription stores exactly this too: the CV ranks the digest, it does
 * not narrow it.
 */
export type SubscriptionFilter = VacancyFilter & SkillFilter;
