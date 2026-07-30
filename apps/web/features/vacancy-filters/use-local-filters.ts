"use client";

import { useCallback, useMemo, useState } from "react";

import { countActiveFilters, EMPTY_FILTERS, type FiltersApi, type FilterState } from "./types";

export interface LocalFiltersApi extends FiltersApi {
  replace: (filters: FilterState) => void;
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function useLocalFilters(initial: FilterState): LocalFiltersApi {
  const [filters, setFilters] = useState(initial);

  const replace = useCallback((next: FilterState) => setFilters(next), []);
  const clear = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const toggleRole = useCallback(
    (id: string) => setFilters((current) => ({ ...current, roleIds: toggle(current.roleIds, id) })),
    [],
  );
  const toggleSkill = useCallback(
    (id: string) =>
      setFilters((current) => ({ ...current, skillIds: toggle(current.skillIds, id) })),
    [],
  );
  const toggleExcludedSkill = useCallback(
    (id: string) =>
      setFilters((current) => ({
        ...current,
        excludedSkillIds: toggle(current.excludedSkillIds, id),
      })),
    [],
  );
  const toggleDomain = useCallback(
    (id: string) =>
      setFilters((current) => ({ ...current, domainIds: toggle(current.domainIds, id) })),
    [],
  );
  const setSource = useCallback(
    (sourceCode: string | null) => setFilters((current) => ({ ...current, sourceCode })),
    [],
  );
  const toggleSeniority = useCallback(
    (value: string) =>
      setFilters((current) => ({
        ...current,
        seniorities: toggle(current.seniorities, value),
      })),
    [],
  );
  const toggleWorkFormat = useCallback(
    (value: string) =>
      setFilters((current) => ({
        ...current,
        workFormats: toggle(current.workFormats, value),
      })),
    [],
  );
  const toggleEnglishLevel = useCallback(
    (value: string) =>
      setFilters((current) => ({
        ...current,
        englishLevels: toggle(current.englishLevels, value),
      })),
    [],
  );
  const toggleEmploymentType = useCallback(
    (value: string) =>
      setFilters((current) => ({
        ...current,
        employmentTypes: toggle(current.employmentTypes, value),
      })),
    [],
  );
  const toggleExperience = useCallback(
    (value: string) =>
      setFilters((current) => ({
        ...current,
        experienceYears: toggle(current.experienceYears, value),
      })),
    [],
  );
  const setFreshness = useCallback(
    (freshness: string) => setFilters((current) => ({ ...current, freshness })),
    [],
  );
  const setTest = useCallback(
    (test: boolean | null) => setFilters((current) => ({ ...current, test })),
    [],
  );
  const setReservation = useCallback(
    (reservation: boolean | null) => setFilters((current) => ({ ...current, reservation })),
    [],
  );
  const setMinFitTier = useCallback(
    (minFitTier: string | null) => setFilters((current) => ({ ...current, minFitTier })),
    [],
  );
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  return {
    filters,
    replace,
    clear,
    toggleRole,
    toggleSkill,
    toggleExcludedSkill,
    toggleDomain,
    setSource,
    toggleSeniority,
    toggleWorkFormat,
    toggleEnglishLevel,
    toggleEmploymentType,
    toggleExperience,
    setFreshness,
    setTest,
    setReservation,
    setMinFitTier,
    activeCount,
  };
}
