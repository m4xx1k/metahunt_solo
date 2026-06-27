"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import type {
  FiltersApi,
  FilterState,
} from "./types";

export type UrlFiltersApi = FiltersApi & { isPending: boolean };

// URL-backed FiltersApi for the landing page. Filter state lives in the
// query string (?roles=&skills=&source=&seniority=&workFormat=&test=
// &reservation=) so the server component can read it and fan out the
// filtered vacancies query — exactly the pattern the old SourceTabs used.
// Any filter change clears `offset`: a new filter context makes the
// current page number meaningless. roles/skills share the ?roles / ?skills
// comma-joined array model the server page already reads (see page.tsx).

const LIST_SEP = ",";

const readList = (raw: string | null): string[] =>
  raw ? raw.split(LIST_SEP).filter(Boolean) : [];

export function useUrlFilters(): UrlFiltersApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const filters: FilterState = useMemo(() => {
    return {
      roleIds: readList(searchParams.get("roles")),
      skillIds: readList(searchParams.get("skills")),
      domainIds: readList(searchParams.get("domains")),
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

  const toggleRole = useCallback(
    (id: string) =>
      commit((n) => {
        const current = filters.roleIds;
        const nextIds = current.includes(id)
          ? current.filter((r) => r !== id)
          : [...current, id];
        if (nextIds.length === 0) n.delete("roles");
        else n.set("roles", nextIds.join(LIST_SEP));
      }),
    [commit, filters.roleIds],
  );

  const toggleSkill = useCallback(
    (id: string) =>
      commit((n) => {
        const current = filters.skillIds;
        const nextIds = current.includes(id)
          ? current.filter((s) => s !== id)
          : [...current, id];
        if (nextIds.length === 0) n.delete("skills");
        else n.set("skills", nextIds.join(LIST_SEP));
      }),
    [commit, filters.skillIds],
  );

  const toggleDomain = useCallback(
    (id: string) =>
      commit((n) => {
        const current = filters.domainIds;
        const nextIds = current.includes(id)
          ? current.filter((d) => d !== id)
          : [...current, id];
        if (nextIds.length === 0) n.delete("domains");
        else n.set("domains", nextIds.join(LIST_SEP));
      }),
    [commit, filters.domainIds],
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
        n.delete("roles");
        n.delete("skills");
        n.delete("domains");
        n.delete("source");
        n.delete("seniority");
        n.delete("workFormat");
        n.delete("test");
        n.delete("reservation");
      }),
    [commit],
  );

  const activeCount =
    filters.roleIds.length +
    filters.skillIds.length +
    filters.domainIds.length +
    (filters.sourceCode ? 1 : 0) +
    (filters.seniority ? 1 : 0) +
    (filters.workFormat ? 1 : 0) +
    (filters.test !== null ? 1 : 0) +
    (filters.reservation !== null ? 1 : 0);

  return {
    filters,
    toggleRole,
    toggleSkill,
    toggleDomain,
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
