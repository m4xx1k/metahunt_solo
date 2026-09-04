import {
  asEnums,
  DEFAULT_FRESHNESS,
  FEED_PAGE_SIZE,
  FRESHNESS_DAYS,
} from "@/features/vacancy-filters/types";
import type { FilterState } from "@/features/vacancy-filters/types";
import type { FitTier } from "@/lib/api/ranking";
import type {
  EmploymentType,
  EnglishLevel,
  ListVacanciesQuery,
  Seniority,
  WorkFormat,
} from "@/lib/api/vacancies";

// The shell computes offsets from this, so it must match the query it sends.
export const LAB_PAGE_SIZE = FEED_PAGE_SIZE;

// FilterState → the cold list query. The lab route has no track presets, so this
// is a straight projection (unlike the home feed, where a track seeds the axes).
// `sample` scores the page against an allowlisted sample candidate (§8) — the
// caller (FeedLabShell) reads it straight from `?sample=`, allowlist-checked
// against the seeded samples the route already has (GET /feed?sample= 404s
// on anything else, so this route has no way to reach an arbitrary real id).
export function toLabColdQuery(f: FilterState, page: number, sample?: string): ListVacanciesQuery {
  const list = (v: string[]) => (v.length > 0 ? v : undefined);
  return {
    page,
    pageSize: LAB_PAGE_SIZE,
    roleIds: list(f.roleIds),
    skillIds: list(f.skillIds),
    excludedSkillIds: list(f.excludedSkillIds),
    domainIds: list(f.domainIds),
    seniorities: asEnums<Seniority>(f.seniorities),
    workFormats: asEnums<WorkFormat>(f.workFormats),
    englishLevels: asEnums<EnglishLevel>(f.englishLevels),
    employmentTypes: asEnums<EmploymentType>(f.employmentTypes),
    experienceYears: list(f.experienceYears),
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    postedWithinDays: FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
    sample,
    // §8.1: freshest is the cold-lens default. `sort: null` (untouched) and
    // `"date"` both stay on the cheap path — only an explicit "best fit"
    // click (`sort === "score"`) opts into the full path. `minFitTier` also
    // forces the full path server-side, so it passes straight through.
    sort: f.sort === "score" ? "score" : undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    // Opt-in only: omit unless the user ticked "show other-stack jobs".
    includeOffStack: f.includeOffStack || undefined,
  };
}
