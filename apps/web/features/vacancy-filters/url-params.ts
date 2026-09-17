// The single URL↔FilterState codec, shared by the client store (use-url-filters)
// and the server components that seed react-query. Both must derive the SAME
// FilterState from a given URL or the SSR seed won't match the client's first
// query key (and react-query refetches on mount, losing the SSR benefit).

import { firstSearchParam } from "@/lib/search-params";

import { DEFAULT_FRESHNESS, FRESHNESS_DAYS, type FilterState } from "./types";

export const LIST_SEP = ",";

// A minimal read view over the query string. Satisfied by both URLSearchParams /
// ReadonlyURLSearchParams (client) and `readerFrom` (server searchParams record).
export interface ParamReader {
  get(key: string): string | null;
  has(key: string): boolean;
}

export const readList = (raw: string | null): string[] =>
  raw ? raw.split(LIST_SEP).filter(Boolean) : [];

export function readBool(raw: string | null): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

// Absent or unknown → the default window; keeps a bad ?fresh from blanking it.
export function readFreshness(raw: string | null): string {
  return raw && FRESHNESS_DAYS[raw] ? raw : DEFAULT_FRESHNESS;
}

export function readFilterState(p: ParamReader): FilterState {
  return {
    roleIds: readList(p.get("roles")),
    skillIds: readList(p.get("skills")),
    excludedSkillIds: readList(p.get("excludeSkills")),
    domainIds: readList(p.get("domains")),
    sourceCode: p.get("source"),
    seniorities: readList(p.get("seniorities")),
    workFormats: readList(p.get("workFormats")),
    englishLevels: readList(p.get("english")),
    employmentTypes: readList(p.get("employment")),
    experienceYears: readList(p.get("experience")),
    freshness: readFreshness(p.get("fresh")),
    test: readBool(p.get("test")),
    reservation: readBool(p.get("reservation")),
    minFitTier: p.get("minFitTier"),
    // Only the two explicit tokens round-trip; anything else (absent, junk) is
    // "untouched" → the lens default (see FilterState.sort).
    sort: p.get("sort") === "date" ? "date" : p.get("sort") === "score" ? "score" : null,
    includeOffStack: readBool(p.get("offStack")) ?? undefined,
  };
}

// The inverse of readFilterState: stamp a whole FilterState onto a live
// URLSearchParams, clearing every key it owns first so applying a saved filter
// can't leave one from the previous one behind. Paging is not ours to touch.
export function writeFilterState(n: URLSearchParams, f: FilterState): void {
  const list = (key: string, v: string[]) =>
    v.length > 0 ? n.set(key, v.join(LIST_SEP)) : n.delete(key);
  const value = (key: string, v: string | null | undefined) => (v ? n.set(key, v) : n.delete(key));
  const tristate = (key: string, v: boolean | null) =>
    v === null ? n.delete(key) : n.set(key, String(v));

  list("roles", f.roleIds);
  list("skills", f.skillIds);
  list("excludeSkills", f.excludedSkillIds);
  list("domains", f.domainIds);
  value("source", f.sourceCode);
  list("seniorities", f.seniorities);
  list("workFormats", f.workFormats);
  list("english", f.englishLevels);
  list("employment", f.employmentTypes);
  list("experience", f.experienceYears);
  value("fresh", f.freshness === DEFAULT_FRESHNESS ? null : f.freshness);
  tristate("test", f.test);
  tristate("reservation", f.reservation);
  value("minFitTier", f.minFitTier);
  value("sort", f.sort);
  if (f.includeOffStack === true) n.set("offStack", "true");
  else n.delete("offStack");
}

// Adapt Next's server `searchParams` (a record of string | string[]) to a
// ParamReader. Absent → has() false (an axis param falls back to its preset);
// present-but-empty ("") → has() true (an explicit empty axis).
export function readerFrom(sp: Record<string, string | string[] | undefined>): ParamReader {
  const first = (v: string | string[] | undefined): string | null => firstSearchParam(v) ?? null;
  return {
    get: (key) => first(sp[key]),
    has: (key) => sp[key] !== undefined,
  };
}
