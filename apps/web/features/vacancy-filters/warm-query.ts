// The warm (reverse-ATS) fetch mapping — filters → a ranked match request for a
// stored candidate. Samples and uploaded CVs are BOTH candidate rows now, so
// there's one path: cvApi.matches(candidateId, …). Pure (no React), so the
// client results hook and the SSR seed fetch through the SAME mapping.

import { cvApi } from "@/lib/api/cv";
import type { FitTier, MatchResponse, MatchSort } from "@/lib/api/ranking";
import { toCsv } from "@/lib/utils";

import { DEFAULT_FRESHNESS, FRESHNESS_DAYS, type FilterState } from "./types";

export const MATCH_PAGE_SIZE = 20;

// Off-stack has no single default: the home feed has always shown those matches
// and has no toggle to bring them back, while the /feed lab hides them until
// asked (that opt-in IS the lab's point). So the route states its default and
// the filter only overrides it once the user has an opinion.
export const HOME_INCLUDE_OFF_STACK = true;
export const LAB_INCLUDE_OFF_STACK = false;

// The warm filter surface — roles + enums + domain + experience + perks + fit +
// freshness (no skill axis: the candidate IS the query; roles are the user's
// explicit hard filter). This subset is what the react-query key hashes, so
// unrelated FilterState churn never refetches.
export function warmFilterKey(f: FilterState, defaultIncludeOffStack: boolean) {
  return {
    roleIds: f.roleIds,
    excludedSkillIds: f.excludedSkillIds,
    seniorities: f.seniorities,
    workFormats: f.workFormats,
    englishLevels: f.englishLevels,
    employmentTypes: f.employmentTypes,
    domainIds: f.domainIds,
    experienceYears: f.experienceYears,
    test: f.test,
    reservation: f.reservation,
    minFitTier: f.minFitTier,
    sort: f.sort,
    includeOffStack: f.includeOffStack ?? defaultIncludeOffStack,
    freshness: f.freshness,
  };
}

export function fetchMatch(
  candidateId: string,
  f: FilterState,
  page: number,
  isSample: boolean,
  defaultIncludeOffStack: boolean,
): Promise<MatchResponse> {
  const query = {
    page,
    pageSize: MATCH_PAGE_SIZE,
    roleIds: toCsv(f.roleIds),
    excludedSkillIds: toCsv(f.excludedSkillIds),
    seniorities: toCsv(f.seniorities),
    workFormats: toCsv(f.workFormats),
    englishLevels: toCsv(f.englishLevels),
    employmentTypes: toCsv(f.employmentTypes),
    domainIds: toCsv(f.domainIds),
    experienceYears: toCsv(f.experienceYears),
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    sort: (f.sort as MatchSort | null) ?? undefined,
    includeOffStack: (f.includeOffStack ?? defaultIncludeOffStack) || undefined,
    postedWithinDays: FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
  };
  return isSample ? cvApi.sampleMatches(candidateId, query) : cvApi.matches(candidateId, query);
}
