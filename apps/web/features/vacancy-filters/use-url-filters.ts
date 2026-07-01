"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import type { FiltersApi, FilterState } from "./types";

export type UrlFiltersApi = FiltersApi & { isPending: boolean };

// URL-backed FiltersApi — the one filter store. State lives in the query string
// so the server component reads it and fans out the filtered query; a local
// (useState) backend could satisfy the same interface with zero component
// changes. Multi-value filters are comma-joined under a single key
// (?seniorities=MIDDLE,SENIOR). Any change clears `offset`: a new filter context
// makes the current page number meaningless.

const LIST_SEP = ",";

const readList = (raw: string | null): string[] =>
  raw ? raw.split(LIST_SEP).filter(Boolean) : [];

export function useUrlFilters(): UrlFiltersApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filters: FilterState = useMemo(
    () => ({
      roleIds: readList(searchParams.get("roles")),
      skillIds: readList(searchParams.get("skills")),
      domainIds: readList(searchParams.get("domains")),
      sourceCode: searchParams.get("source"),
      seniorities: readList(searchParams.get("seniorities")),
      workFormats: readList(searchParams.get("workFormats")),
      englishLevels: readList(searchParams.get("english")),
      employmentTypes: readList(searchParams.get("employment")),
      experienceYears: readList(searchParams.get("experience")),
      fresh: searchParams.get("fresh") === "true",
      test: readBool(searchParams.get("test")),
      reservation: readBool(searchParams.get("reservation")),
      minFitTier: searchParams.get("minFitTier"),
    }),
    [searchParams],
  );

  const commit = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.delete("offset");
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
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

  const setFlag = useCallback(
    (key: string, on: boolean) =>
      commit((n) => (on ? n.set(key, "true") : n.delete(key))),
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
    (filters.fresh ? 1 : 0) +
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
    setFresh: useCallback((v: boolean) => setFlag("fresh", v), [setFlag]),
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
    isPending,
  };
}

function readBool(raw: string | null): boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}
