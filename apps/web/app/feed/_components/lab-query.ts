import { asEnums, FRESHNESS_DAYS, DEFAULT_FRESHNESS } from "@/features/vacancy-filters/types";
import type { FilterState } from "@/features/vacancy-filters/types";
import type {
  EmploymentType,
  EnglishLevel,
  ListVacanciesQuery,
  Seniority,
  WorkFormat,
} from "@/lib/api/vacancies";

export const LAB_PAGE_SIZE = 20;

// FilterState → the cold list query. The lab route has no track presets, so this
// is a straight projection (unlike the home feed, where a track seeds the axes).
export function toLabColdQuery(f: FilterState, page: number): ListVacanciesQuery {
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
  };
}
