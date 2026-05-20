"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import type {
  FiltersApi,
  FilterState,
} from "@/components/data/vacancy-filters";

export type UrlFiltersApi = FiltersApi & { isPending: boolean };

// URL-backed FiltersApi for the landing page. Filter state lives in the
// query string (?role=&skills=&source=&seniority=&workFormat=&test=
// &reservation=) so the server component can read it and fan out the
// filtered vacancies query — exactly the pattern the old SourceTabs used.
// Any filter change clears `offset`: a new filter context makes the
// current page number meaningless.

const SKILLS_SEP = ",";

export function useUrlFilters(): UrlFiltersApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filters: FilterState = useMemo(() => {
    const skills = searchParams.get("skills");
    return {
      roleId: searchParams.get("role"),
      skillIds: skills ? skills.split(SKILLS_SEP).filter(Boolean) : [],
      sourceCode: searchParams.get("source"),
      seniority: searchParams.get("seniority"),
      workFormat: searchParams.get("workFormat"),
      test: readBool(searchParams.get("test")),
      reservation: readBool(searchParams.get("reservation")),
    };
  }, [searchParams]);

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

  const setRole = useCallback(
    (id: string | null) =>
      commit((n) => (id ? n.set("role", id) : n.delete("role"))),
    [commit],
  );

  const toggleSkill = useCallback(
    (id: string) =>
      commit((n) => {
        const current = filters.skillIds;
        const nextIds = current.includes(id)
          ? current.filter((s) => s !== id)
          : [...current, id];
        if (nextIds.length === 0) n.delete("skills");
        else n.set("skills", nextIds.join(SKILLS_SEP));
      }),
    [commit, filters.skillIds],
  );

  const setSource = useCallback(
    (code: string | null) =>
      commit((n) => (code ? n.set("source", code) : n.delete("source"))),
    [commit],
  );

  const setSeniority = useCallback(
    (v: string | null) =>
      commit((n) => (v ? n.set("seniority", v) : n.delete("seniority"))),
    [commit],
  );

  const setWorkFormat = useCallback(
    (v: string | null) =>
      commit((n) => (v ? n.set("workFormat", v) : n.delete("workFormat"))),
    [commit],
  );

  const setTest = useCallback(
    (v: boolean | null) =>
      commit((n) =>
        v === null ? n.delete("test") : n.set("test", String(v)),
      ),
    [commit],
  );

  const setReservation = useCallback(
    (v: boolean | null) =>
      commit((n) =>
        v === null
          ? n.delete("reservation")
          : n.set("reservation", String(v)),
      ),
    [commit],
  );

  const clear = useCallback(
    () =>
      commit((n) => {
        n.delete("role");
        n.delete("skills");
        n.delete("source");
        n.delete("seniority");
        n.delete("workFormat");
        n.delete("test");
        n.delete("reservation");
      }),
    [commit],
  );

  const activeCount =
    (filters.roleId ? 1 : 0) +
    filters.skillIds.length +
    (filters.sourceCode ? 1 : 0) +
    (filters.seniority ? 1 : 0) +
    (filters.workFormat ? 1 : 0) +
    (filters.test !== null ? 1 : 0) +
    (filters.reservation !== null ? 1 : 0);

  return {
    filters,
    setRole,
    toggleSkill,
    setSource,
    setSeniority,
    setWorkFormat,
    setTest,
    setReservation,
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
