"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";

import type {
  FiltersApi,
  FilterState,
} from "@/components/data/vacancy-filters";

export type UrlFiltersApi = FiltersApi & { isPending: boolean };

// URL-backed FiltersApi for the landing page. Filter state lives in the
// query string (?role=&skills=&source=) so the server component can read
// it and fan out the filtered vacancies query — exactly the pattern the
// old SourceTabs used. Any filter change clears `offset`: a new filter
// context makes the current page number meaningless.
//
// test / reservation are intentionally inert: the list endpoint can't
// filter on them, so the landing sidebar never renders those sections.

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
      test: null,
      reservation: null,
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

  const clear = useCallback(
    () =>
      commit((n) => {
        n.delete("role");
        n.delete("skills");
        n.delete("source");
      }),
    [commit],
  );

  const noop = useCallback(() => {}, []);

  const activeCount =
    (filters.roleId ? 1 : 0) +
    filters.skillIds.length +
    (filters.sourceCode ? 1 : 0);

  return {
    filters,
    setRole,
    toggleSkill,
    setSource,
    setTest: noop,
    setReservation: noop,
    clear,
    activeCount,
    isPending,
  };
}
