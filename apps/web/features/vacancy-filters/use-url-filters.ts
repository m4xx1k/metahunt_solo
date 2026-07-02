"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { DEFAULT_FRESHNESS } from "./types";
import type { FiltersApi } from "./types";
import { LIST_SEP, readFilterState, readList } from "./url-params";

// URL-backed FiltersApi — the one filter store. State lives in the query string
// so a server component can seed it and the client refetches on change; a local
// (useState) backend could satisfy the same interface with zero component
// changes. Multi-value filters are comma-joined under a single key
// (?seniorities=MIDDLE,SENIOR). Commits are shallow (pushState, no RSC nav), so
// loading now comes from the results query's isFetching — not this hook.

export function useUrlFilters(): FiltersApi {
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();

  const filters = useMemo(() => readFilterState(searchParams), [searchParams]);

  // Any filter change clears ?offset: a new filter context makes the current
  // page number meaningless.
  const commit = useCallback(
    (mutate: (next: URLSearchParams) => void) =>
      push((next) => {
        mutate(next);
        next.delete("offset");
      }),
    [push],
  );

  // Comma-joined multi-select over one URL key: add/remove `value`.
  const toggleList = useCallback(
    (key: string, value: string) =>
      commit((n) => {
        const current = readList(n.get(key));
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        if (next.length === 0) n.delete(key);
        else n.set(key, next.join(LIST_SEP));
      }),
    [commit],
  );

  // Freshness always resolves to a window; the default (month) is the clean URL.
  const setFreshness = useCallback(
    (v: string) =>
      commit((n) =>
        v === DEFAULT_FRESHNESS ? n.delete("fresh") : n.set("fresh", v),
      ),
    [commit],
  );

  const setValue = useCallback(
    (key: string, v: string | null) =>
      commit((n) => (v ? n.set(key, v) : n.delete(key))),
    [commit],
  );

  const setTristate = useCallback(
    (key: string, v: boolean | null) =>
      commit((n) => (v === null ? n.delete(key) : n.set(key, String(v)))),
    [commit],
  );

  const clear = useCallback(
    () =>
      commit((n) => {
        for (const key of [
          "roles",
          "skills",
          "domains",
          "source",
          "seniorities",
          "workFormats",
          "english",
          "employment",
          "experience",
          "fresh",
          "test",
          "reservation",
          "minFitTier",
        ]) {
          n.delete(key);
        }
      }),
    [commit],
  );

  const activeCount =
    filters.roleIds.length +
    filters.skillIds.length +
    filters.domainIds.length +
    (filters.sourceCode ? 1 : 0) +
    filters.seniorities.length +
    filters.workFormats.length +
    filters.englishLevels.length +
    filters.employmentTypes.length +
    filters.experienceYears.length +
    (filters.freshness !== DEFAULT_FRESHNESS ? 1 : 0) +
    (filters.test !== null ? 1 : 0) +
    (filters.reservation !== null ? 1 : 0) +
    (filters.minFitTier ? 1 : 0);

  return {
    filters,
    toggleRole: useCallback((id: string) => toggleList("roles", id), [toggleList]),
    toggleSkill: useCallback((id: string) => toggleList("skills", id), [toggleList]),
    toggleDomain: useCallback(
      (id: string) => toggleList("domains", id),
      [toggleList],
    ),
    setSource: useCallback((code: string | null) => setValue("source", code), [setValue]),
    toggleSeniority: useCallback(
      (v: string) => toggleList("seniorities", v),
      [toggleList],
    ),
    toggleWorkFormat: useCallback(
      (v: string) => toggleList("workFormats", v),
      [toggleList],
    ),
    toggleEnglishLevel: useCallback(
      (v: string) => toggleList("english", v),
      [toggleList],
    ),
    toggleEmploymentType: useCallback(
      (v: string) => toggleList("employment", v),
      [toggleList],
    ),
    toggleExperience: useCallback(
      (v: string) => toggleList("experience", v),
      [toggleList],
    ),
    setFreshness,
    setTest: useCallback((v: boolean | null) => setTristate("test", v), [setTristate]),
    setReservation: useCallback(
      (v: boolean | null) => setTristate("reservation", v),
      [setTristate],
    ),
    setMinFitTier: useCallback(
      (v: string | null) => setValue("minFitTier", v),
      [setValue],
    ),
    clear,
    activeCount,
  };
}
