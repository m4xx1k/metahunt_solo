import { asEnums, FRESHNESS_DAYS, DEFAULT_FRESHNESS } from "@/features/vacancy-filters/types";
import type { FilterState } from "@/features/vacancy-filters/types";
import type { FitTier } from "@/lib/api/ranking";
import { MATCH_PAGE_SIZE } from "@/features/vacancy-filters/warm-query";
import type {
  EmploymentType,
  EnglishLevel,
  ListVacanciesQuery,
  Seniority,
  WorkFormat,
} from "@/lib/api/vacancies";

// Same page size as the warm fetch — the shell computes offsets from this while
// fetchMatch requests MATCH_PAGE_SIZE, so they cannot be allowed to drift.
export const LAB_PAGE_SIZE = MATCH_PAGE_SIZE;

// FilterState → the cold list query. The lab route has no track presets, so this
// is a straight projection (unlike the home feed, where a track seeds the axes).
// `sample` scores the page against an allowlisted sample candidate (§8) — the
// caller (FeedLabShell) only ever passes one when `?cv=` resolved to a seeded
// sample, never an arbitrary real candidate id (GET /feed?sample= 404s on those).
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
    includeOffStack: f.includeOffStack,
  };
}
