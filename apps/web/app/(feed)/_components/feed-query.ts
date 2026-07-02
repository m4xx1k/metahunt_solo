// The cold (feed) URL→query codec. The server component seeds react-query with
// the list it fetched for the incoming URL; the client shell recomputes the same
// query from `useSearchParams` on every filter change. Both go through here so
// the SSR seed and the client's first query key are identical (no mount refetch).

import {
  coerceBool,
  coerceEnumList,
  EMPLOYMENT_TYPE_VALUES,
  ENGLISH_LEVEL_VALUES,
  SENIORITY_VALUES,
  WORK_FORMAT_VALUES,
  type ListVacanciesQuery,
} from "@/lib/api/vacancies";
import type { SubscriptionParams } from "@/lib/api/subscriptions";
import { DEFAULT_FRESHNESS, FRESHNESS_DAYS } from "@/features/vacancy-filters/types";
import { readList, type ParamReader } from "@/features/vacancy-filters/url-params";

export const PAGE_SIZE = 20;

export interface FeedQueryInputs {
  /** True on a track route: an empty effective axis set means "match nothing". */
  trackActive: boolean;
  /** The active track's preset ROLE ids — the fallback when ?roles is absent. */
  presetRoleIds: string[];
  presetSkillIds: string[];
  /** Source catalog for the ?source code → sourceId resolution. */
  sources: { id: string; code: string }[];
}

export interface FeedQueryResult {
  /** null → a track whose axes are all empty: render an empty list, don't query. */
  query: ListVacanciesQuery | null;
  offset: number;
  page: number;
}

function asNonNegativeInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function buildFeedListQuery(
  p: ParamReader,
  { trackActive, presetRoleIds, presetSkillIds, sources }: FeedQueryInputs,
): FeedQueryResult {
  const offset = asNonNegativeInt(p.get("offset"), 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  // Axis params: absent → the track's preset; present (even "") → the explicit set.
  const roleIds = p.has("roles") ? readList(p.get("roles")) : presetRoleIds;
  const skillIds = p.has("skills") ? readList(p.get("skills")) : presetSkillIds;
  const domainIds = readList(p.get("domains"));

  const sourceCode = p.get("source");
  const sourceId = sourceCode
    ? sources.find((s) => s.code === sourceCode)?.id
    : undefined;

  const seniorities = coerceEnumList(SENIORITY_VALUES, p.get("seniorities") ?? undefined);
  const workFormats = coerceEnumList(WORK_FORMAT_VALUES, p.get("workFormats") ?? undefined);
  const englishLevels = coerceEnumList(ENGLISH_LEVEL_VALUES, p.get("english") ?? undefined);
  const employmentTypes = coerceEnumList(
    EMPLOYMENT_TYPE_VALUES,
    p.get("employment") ?? undefined,
  );
  const postedWithinDays =
    FRESHNESS_DAYS[p.get("fresh") ?? ""] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS];
  const experience = readList(p.get("experience"));

  const hasPreset = roleIds.length > 0 || skillIds.length > 0;
  if (trackActive && !hasPreset) return { query: null, offset, page };

  const query: ListVacanciesQuery = {
    page,
    pageSize: PAGE_SIZE,
    roleIds: roleIds.length > 0 ? roleIds : undefined,
    skillIds: skillIds.length > 0 ? skillIds : undefined,
    domainIds: domainIds.length > 0 ? domainIds : undefined,
    includeOptionalSkills: p.get("nice") === "true" ? true : undefined,
    sourceId: sourceId ?? undefined,
    seniorities: seniorities.length > 0 ? seniorities : undefined,
    workFormats: workFormats.length > 0 ? workFormats : undefined,
    englishLevels: englishLevels.length > 0 ? englishLevels : undefined,
    employmentTypes: employmentTypes.length > 0 ? employmentTypes : undefined,
    experienceYears: experience.length > 0 ? experience : undefined,
    hasTestAssignment: coerceBool(p.get("test") ?? undefined),
    hasReservation: coerceBool(p.get("reservation") ?? undefined),
    hasDuplicates: p.get("dupes") === "true" ? true : undefined,
    postedWithinDays,
  };
  return { query, offset, page };
}

// The effective query a subscription replays — the list query minus pagination
// and the two scope toggles (dupes/nice) a feed digest doesn't carry.
export function toSubscriptionParams(q: ListVacanciesQuery): SubscriptionParams {
  return {
    roleIds: q.roleIds,
    skillIds: q.skillIds,
    domainIds: q.domainIds,
    sourceId: q.sourceId,
    seniorities: q.seniorities,
    workFormats: q.workFormats,
    englishLevels: q.englishLevels,
    employmentTypes: q.employmentTypes,
    experienceYears: q.experienceYears,
    hasTestAssignment: q.hasTestAssignment,
    hasReservation: q.hasReservation,
    postedWithinDays: q.postedWithinDays,
  };
}
