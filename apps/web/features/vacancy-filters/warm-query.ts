// The warm (reverse-ATS) fetch mapping — filters → a ranked match request for a
// stored candidate. Samples and uploaded CVs are BOTH candidate rows now, so
// there's one path: cvApi.matches(candidateId, …). Pure (no React), so the
// client results hook and the SSR seed fetch through the SAME mapping.

import { cvApi } from "@/lib/api/cv";
import type { FitTier, MatchResponse } from "@/lib/api/ranking";
import { toCsv } from "@/lib/utils";

import { DEFAULT_FRESHNESS, FRESHNESS_DAYS, type FilterState } from "./types";

export const MATCH_PAGE_SIZE = 20;

// The warm filter surface — enums + domain + experience + perks + fit + freshness
// (no role/skill axes: the candidate IS the query). This subset is what the
// react-query key hashes, so unrelated FilterState churn never refetches.
export function warmFilterKey(f: FilterState) {
  return {
    seniorities: f.seniorities,
    workFormats: f.workFormats,
    englishLevels: f.englishLevels,
    employmentTypes: f.employmentTypes,
    domainIds: f.domainIds,
    experienceYears: f.experienceYears,
    test: f.test,
    reservation: f.reservation,
    minFitTier: f.minFitTier,
    freshness: f.freshness,
  };
}

export function fetchMatch(
  candidateId: string,
  f: FilterState,
  page: number,
): Promise<MatchResponse> {
  return cvApi.matches(candidateId, {
    page,
    pageSize: MATCH_PAGE_SIZE,
    seniorities: toCsv(f.seniorities),
    workFormats: toCsv(f.workFormats),
    englishLevels: toCsv(f.englishLevels),
    employmentTypes: toCsv(f.employmentTypes),
    domainIds: toCsv(f.domainIds),
    experienceYears: toCsv(f.experienceYears),
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    postedWithinDays:
      FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
  });
}
