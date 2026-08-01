import type { CvMatchParams } from "@/lib/api/subscriptions";
import type { EmploymentType, EnglishLevel, Seniority, WorkFormat } from "@/lib/api/vacancies";
import type { FitTier } from "@/lib/api/ranking";

import {
  asEnums,
  DEFAULT_FRESHNESS,
  EMPTY_FILTERS,
  FRESHNESS_DAYS,
  type FilterState,
} from "./types";

function freshnessFor(days: number | undefined): string {
  const entry = Object.entries(FRESHNESS_DAYS).find(([, value]) => value === days);
  return entry?.[0] ?? DEFAULT_FRESHNESS;
}

export function subscriptionCriteriaToFilters(params: CvMatchParams): FilterState {
  return {
    ...EMPTY_FILTERS,
    roleIds: params.roleIds ?? [],
    excludedSkillIds: params.excludedSkillIds ?? [],
    domainIds: params.domainIds ?? [],
    seniorities: params.seniorities ?? [],
    workFormats: params.workFormats ?? [],
    englishLevels: params.englishLevels ?? [],
    employmentTypes: params.employmentTypes ?? [],
    experienceYears: params.experienceYears ?? [],
    freshness: freshnessFor(params.postedWithinDays),
    test: params.hasTestAssignment ?? null,
    reservation: params.hasReservation ?? null,
    minFitTier: params.minFitTier ?? null,
  };
}

// includeOffStack is deliberately NOT persisted yet: giving subscribers real
// control over it is MET-122; until then every digest includes off-stack.
export function filtersToSubscriptionCriteria(
  filters: FilterState,
  current: CvMatchParams,
  initial: FilterState,
): CvMatchParams {
  return {
    ...current,
    roleIds: filters.roleIds.length > 0 ? filters.roleIds : undefined,
    excludedSkillIds: filters.excludedSkillIds.length > 0 ? filters.excludedSkillIds : undefined,
    seniorities: asEnums<Seniority>(filters.seniorities),
    workFormats: asEnums<WorkFormat>(filters.workFormats),
    englishLevels: asEnums<EnglishLevel>(filters.englishLevels),
    employmentTypes: asEnums<EmploymentType>(filters.employmentTypes),
    domainIds: filters.domainIds.length > 0 ? filters.domainIds : undefined,
    experienceYears: filters.experienceYears.length > 0 ? filters.experienceYears : undefined,
    hasTestAssignment: filters.test ?? undefined,
    hasReservation: filters.reservation ?? undefined,
    minFitTier: filters.minFitTier ? (filters.minFitTier as FitTier) : undefined,
    postedWithinDays:
      filters.freshness === initial.freshness
        ? current.postedWithinDays
        : (FRESHNESS_DAYS[filters.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS]),
  };
}

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function areFiltersEqual(left: FilterState, right: FilterState): boolean {
  return (
    sameValues(left.roleIds, right.roleIds) &&
    sameValues(left.skillIds, right.skillIds) &&
    sameValues(left.excludedSkillIds, right.excludedSkillIds) &&
    sameValues(left.domainIds, right.domainIds) &&
    left.sourceCode === right.sourceCode &&
    sameValues(left.seniorities, right.seniorities) &&
    sameValues(left.workFormats, right.workFormats) &&
    sameValues(left.englishLevels, right.englishLevels) &&
    sameValues(left.employmentTypes, right.employmentTypes) &&
    sameValues(left.experienceYears, right.experienceYears) &&
    left.freshness === right.freshness &&
    left.test === right.test &&
    left.reservation === right.reservation &&
    left.minFitTier === right.minFitTier &&
    // Digests always include off-stack matches, so "no preference" means
    // included on both sides of the comparison.
    (left.includeOffStack ?? true) === (right.includeOffStack ?? true)
  );
}
