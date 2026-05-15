"use client";

import { useCallback, useMemo, useState } from "react";
import { EMPTY_FILTERS, type FilterState } from "./types";

export interface FiltersApi {
  filters: FilterState;
  setRole: (id: string | null) => void;
  toggleSkill: (id: string) => void;
  setSource: (code: string | null) => void;
  setTest: (v: boolean | null) => void;
  setReservation: (v: boolean | null) => void;
  clear: () => void;
  activeCount: number;
}

export function useFilters(): FiltersApi {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const setRole = useCallback(
    (id: string | null) => setFilters((f) => ({ ...f, roleId: id })),
    [],
  );

  const toggleSkill = useCallback((id: string) => {
    setFilters((f) => ({
      ...f,
      skillIds: f.skillIds.includes(id)
        ? f.skillIds.filter((s) => s !== id)
        : [...f.skillIds, id],
    }));
  }, []);

  const setSource = useCallback(
    (code: string | null) => setFilters((f) => ({ ...f, sourceCode: code })),
    [],
  );
  const setTest = useCallback(
    (v: boolean | null) => setFilters((f) => ({ ...f, test: v })),
    [],
  );
  const setReservation = useCallback(
    (v: boolean | null) => setFilters((f) => ({ ...f, reservation: v })),
    [],
  );
  const clear = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.roleId) n += 1;
    n += filters.skillIds.length;
    if (filters.sourceCode) n += 1;
    if (filters.test !== null) n += 1;
    if (filters.reservation !== null) n += 1;
    return n;
  }, [filters]);

  return {
    filters,
    setRole,
    toggleSkill,
    setSource,
    setTest,
    setReservation,
    clear,
    activeCount,
  };
}
