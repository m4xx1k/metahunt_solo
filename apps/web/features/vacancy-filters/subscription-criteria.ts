import type { SubscriptionFilter } from "@/lib/api/subscriptions";
import type { MeSubscription } from "@/lib/api/me";
import type { EmploymentType, EnglishLevel, Seniority, WorkFormat } from "@/lib/api/vacancies";

import { asEnums, EMPTY_FILTERS, type FilterState } from "./types";

// The stored filter → the rail's own shape. `sources` resolves a persisted
// sourceId back to the code the URL carries; without it (the subscription
// editor, which has no source section) that filter shows as off — `stateToFilter`
// carries the id across instead of letting the round-trip drop it.
export function filterToState(
  filter: SubscriptionFilter,
  sources: { id: string; code: string }[] = [],
): FilterState {
  return {
    ...EMPTY_FILTERS,
    roleIds: filter.roleIds ?? [],
    skillIds: filter.skillIds ?? [],
    excludedSkillIds: filter.excludedSkillIds ?? [],
    domainIds: filter.domainIds ?? [],
    sourceCode: sources.find((s) => s.id === filter.sourceId)?.code ?? null,
    seniorities: filter.seniorities ?? [],
    workFormats: filter.workFormats ?? [],
    englishLevels: filter.englishLevels ?? [],
    employmentTypes: filter.employmentTypes ?? [],
    experienceYears: filter.experienceYears ?? [],
    test: filter.hasTestAssignment ?? null,
    reservation: filter.hasReservation ?? null,
  };
}

/**
 * The rail's shape → the stored filter. The inverse of `filterToState`, and the
 * one place an edited subscription is written.
 *
 * `sourceId` is carried rather than read off the state: the rail has no source
 * section, so the state cannot express it, and deriving it would silently widen
 * a subscription on every save. Freshness, ranking and paging are not written at
 * all — they are not part of a subscription (see lib/api/filters.ts).
 */
export function stateToFilter(state: FilterState, sourceId?: string): SubscriptionFilter {
  return {
    sourceId,
    roleIds: state.roleIds.length > 0 ? state.roleIds : undefined,
    skillIds: state.skillIds.length > 0 ? state.skillIds : undefined,
    excludedSkillIds: state.excludedSkillIds.length > 0 ? state.excludedSkillIds : undefined,
    domainIds: state.domainIds.length > 0 ? state.domainIds : undefined,
    seniorities: asEnums<Seniority>(state.seniorities),
    workFormats: asEnums<WorkFormat>(state.workFormats),
    englishLevels: asEnums<EnglishLevel>(state.englishLevels),
    employmentTypes: asEnums<EmploymentType>(state.employmentTypes),
    experienceYears: state.experienceYears.length > 0 ? state.experienceYears : undefined,
    hasTestAssignment: state.test ?? undefined,
    hasReservation: state.reservation ?? undefined,
  };
}

// Compare at the filter level, not the FilterState level: the filter is what
// the digest actually replays and what the server's dedup keys on, and it has
// no room for the rail-only axes (freshness, sort, off-stack) that would
// otherwise report a subscription as changed when nothing savable changed.
function normalize(p: SubscriptionFilter): string {
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
export function subscriptionCovers(sub: MeSubscription, params: SubscriptionFilter): boolean {
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
  params: SubscriptionFilter,
): MeSubscription | null {
  if (!subs) return null;
  const wanted = normalize(params);
  // Only a live one counts: unconfirmed and switched-off subscriptions deliver
  // nothing, so calling them "subscribed" would be a lie. Tapping Subscribe
  // again is safe — the server reuses an identical row instead of making a twin.
  return subs.find((s) => s.status === "live" && normalize(s.params) === wanted) ?? null;
}

/** Did anything the server would store actually change? */
export function filtersDiffer(left: SubscriptionFilter, right: SubscriptionFilter): boolean {
  return normalize(left) !== normalize(right);
}
