import type { CvMatchParams, SubscriptionParams } from "@/lib/api/subscriptions";
import type { MeSubscription } from "@/lib/api/me";
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

// `sources` resolves a persisted sourceId back to the code the URL carries;
// without it (the CV editor, which has no source facet) that filter stays off.
export function subscriptionCriteriaToFilters(
  params: CvMatchParams | SubscriptionParams,
  sources: { id: string; code: string }[] = [],
): FilterState {
  const p = params as SubscriptionParams;
  return {
    ...EMPTY_FILTERS,
    skillIds: p.skillIds ?? [],
    sourceCode: sources.find((s) => s.id === p.sourceId)?.code ?? null,
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

type Params = SubscriptionParams | CvMatchParams;

// Compare at the params level, not the FilterState level: params are what the
// digest actually replays, and they round-trip through the API unchanged. Going
// via FilterState would have to invent a sourceId→sourceCode lookup and would
// silently drop the fields that shape has no room for.
function normalize(p: Params): string {
  const entries = Object.entries(p as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]): [string, unknown] => [k, Array.isArray(v) ? [...v].sort() : v])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

// The subscription that already covers what is on screen, or null. A
// subscription *is* its filter: the CV a legacy digest ranks against changes
// the order it arrives in, not which vacancies it covers, so an identical
// filter is the same alert whether or not a CV hangs off it.
export function subscriptionCovers(sub: MeSubscription, params: Params): boolean {
  return sub.status === "live" && normalize(sub.params) === normalize(params);
}

// One row per distinct filter. Legacy rows can differ only by the CV they rank
// against, which the feed cannot express — two of them would highlight together
// and leave "manage" pointing at an arbitrary one. Newest wins; the server no
// longer lets a second one be created.
export function dedupeByFilter(subs: MeSubscription[]): MeSubscription[] {
  const seen = new Set<string>();
  return subs.filter((s) => {
    const key = normalize(s.params);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findMatchingSubscription(
  subs: MeSubscription[] | undefined,
  params: Params,
): MeSubscription | null {
  if (!subs) return null;
  const wanted = normalize(params);
  // Only a live one counts: unconfirmed and switched-off subscriptions deliver
  // nothing, so calling them "subscribed" would be a lie. Tapping Subscribe
  // again is safe — the server reuses an identical row instead of making a twin.
  return subs.find((s) => s.status === "live" && normalize(s.params) === wanted) ?? null;
}
