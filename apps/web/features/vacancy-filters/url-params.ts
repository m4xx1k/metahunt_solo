// The single URL↔FilterState codec, shared by the client store (use-url-filters)
// and the server components that seed react-query. Both must derive the SAME
// FilterState from a given URL or the SSR seed won't match the client's first
// query key (and react-query refetches on mount, losing the SSR benefit).

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
  };
}

// Adapt Next's server `searchParams` (a record of string | string[]) to a
// ParamReader. Absent → has() false (an axis param falls back to its preset);
// present-but-empty ("") → has() true (an explicit empty axis).
export function readerFrom(
  sp: Record<string, string | string[] | undefined>,
): ParamReader {
  const first = (v: string | string[] | undefined): string | null => {
    const s = Array.isArray(v) ? v[0] : v;
    return s ?? null;
  };
  return {
    get: (key) => first(sp[key]),
    has: (key) => sp[key] !== undefined,
  };
}
