// The warm (reverse-ATS) fetch mapping — filters → a ranked match request.
// Pure (no React), so the client results hook and the SSR seed on the
// reverse-ATS page both fetch through the SAME mapping and agree on the seed.

import { cvApi } from "@/lib/api/cv";
import {
  rankingApi,
  type FitTier,
  type MatchResponse,
} from "@/lib/api/ranking";
import type {
  EmploymentType,
  EnglishLevel,
  Seniority,
  WorkFormat,
} from "@/lib/api/vacancies";
import { toCsv } from "@/lib/utils";

import { asEnums, DEFAULT_FRESHNESS, FRESHNESS_DAYS, type FilterState } from "./types";

export const MATCH_PAGE_SIZE = 20;

// Which candidate is being ranked. `sample` carries the resolved skill list
// (samples aren't stored), `cv` an uploaded candidate id. Kept app-agnostic so
// it can live in the feature: the reverse-ATS page maps its own Source into it.
export type WarmSource =
  | { kind: "sample"; skills: string[] }
  | { kind: "cv"; candidateId: string };

// Warm reads only the closed-enum + perk + fit + freshness surface — no
// role/skill/domain axes (the candidate IS the query). This subset is what the
// react-query key hashes, so unrelated FilterState churn never refetches.
export function warmFilterKey(f: FilterState) {
  return {
    seniorities: f.seniorities,
    workFormats: f.workFormats,
    englishLevels: f.englishLevels,
    employmentTypes: f.employmentTypes,
    test: f.test,
    reservation: f.reservation,
    minFitTier: f.minFitTier,
    freshness: f.freshness,
  };
}

export function fetchMatch(
  source: WarmSource,
  f: FilterState,
  page: number,
): Promise<MatchResponse> {
  // Scalars shared by both paths; multi-value filters differ only in wire
  // format — JSON arrays for the POST body, CSV for the GET query.
  const scalar = {
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    postedWithinDays:
      FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
  };
  if (source.kind === "sample") {
    return rankingApi.match({
      skills: source.skills,
      page,
      pageSize: MATCH_PAGE_SIZE,
      seniorities: asEnums<Seniority>(f.seniorities),
      workFormats: asEnums<WorkFormat>(f.workFormats),
      englishLevels: asEnums<EnglishLevel>(f.englishLevels),
      employmentTypes: asEnums<EmploymentType>(f.employmentTypes),
      ...scalar,
    });
  }
  return cvApi.matches(source.candidateId, {
    page,
    pageSize: MATCH_PAGE_SIZE,
    seniorities: toCsv(f.seniorities),
    workFormats: toCsv(f.workFormats),
    englishLevels: toCsv(f.englishLevels),
    employmentTypes: toCsv(f.employmentTypes),
    ...scalar,
  });
}
