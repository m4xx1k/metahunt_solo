import { asEnums, FRESHNESS_DAYS, DEFAULT_FRESHNESS } from "@/features/vacancy-filters/types";
import type { FilterState } from "@/features/vacancy-filters/types";
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
    // NOT wired to f.sort/minFitTier yet — see the journal's step 6 note.
    // FilterState.sort: null means "score is the default" for the WARM lens
    // it was designed for (LabControls' "fit" button just resets to null);
    // §8.1 locks freshest as the COLD-lens default, so null must NOT become
    // sort=score here without first telling "never touched" apart from
    // "explicitly clicked fit" — FilterState can't do that today. Leaving
    // this undefined (→ freshest) is the safe default; wiring the toggle
    // needs that distinction resolved first, not a silent guess.
    includeOffStack: f.includeOffStack,
  };
}
