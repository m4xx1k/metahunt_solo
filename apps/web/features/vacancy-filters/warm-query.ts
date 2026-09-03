// The warm (reverse-ATS) fetch mapping — filters → a query against the SAME
// unified GET /feed the cold lens uses (MET-144 step 7). No `?cv=` /
// candidateId param travels for a real CV: the viewer's active CV is the
// JWT's, resolved server-side (resolveActiveCandidateId) — this only ever
// runs for a signed-in owner of `candidateId`, which the concurrent
// GET /cv/:id call below double-checks (its own 404 is this function's
// staleness signal, same role `/cv/:id/matches`'s 404 used to play). A
// sample keeps going through `?sample=`, same as the cold lens. Either way
// the response gets reshaped into `MatchResponse` (toMatchResponse) so none
// of the warm-lens UI (WarmBody/WarmCard/CandidateProfile/MatchFilters) had
// to change. Pure (no React), so the client results hook and the SSR seed
// fetch through the SAME mapping.

import { cvApi } from "@/lib/api/cv";
import type { FitTier, MatchResponse, MatchSort } from "@/lib/api/ranking";
import {
  vacanciesApi,
  type EmploymentType,
  type EnglishLevel,
  type ListVacanciesQuery,
  type Seniority,
  type WorkFormat,
} from "@/lib/api/vacancies";

import { toMatchResponse } from "./to-match-response";
import { asEnums, DEFAULT_FRESHNESS, FRESHNESS_DAYS, type FilterState } from "./types";

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

export async function fetchMatch(
  candidateId: string,
  f: FilterState,
  page: number,
  isSample: boolean,
  defaultIncludeOffStack: boolean,
): Promise<MatchResponse> {
  const list = (v: string[]) => (v.length > 0 ? v : undefined);
  const query: ListVacanciesQuery = {
    page,
    pageSize: MATCH_PAGE_SIZE,
    roleIds: list(f.roleIds),
    excludedSkillIds: list(f.excludedSkillIds),
    seniorities: asEnums<Seniority>(f.seniorities),
    workFormats: asEnums<WorkFormat>(f.workFormats),
    englishLevels: asEnums<EnglishLevel>(f.englishLevels),
    employmentTypes: asEnums<EmploymentType>(f.employmentTypes),
    domainIds: list(f.domainIds),
    experienceYears: list(f.experienceYears),
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    // The warm lens's own locked default is best-fit, unlike the cold lens's
    // freshest (§8.1) — untouched (`null`) still means "score" here.
    sort: ((f.sort as MatchSort | null) ?? "score") as MatchSort,
    includeOffStack: (f.includeOffStack ?? defaultIncludeOffStack) || undefined,
    postedWithinDays: FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
    sample: isSample ? candidateId : undefined,
  };

  // GET /cv/:id is a double duty: `unmatched` (not on the feed response —
  // it's the candidate's own extraction gap, not per-vacancy) and, for a
  // real CV, the same ownership check `/cv/:id/matches` used to fail loudly
  // on — a candidateId localStorage kept past its CV's deletion 404s here
  // exactly like it used to, so useFeedWarm's existing notFound handling
  // needs no change.
  const [feed, profile] = await Promise.all([vacanciesApi.list(query), cvApi.get(candidateId)]);
  return toMatchResponse(feed, profile.unmatched);
}
