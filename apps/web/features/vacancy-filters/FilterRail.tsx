"use client";

import { EnumSection } from "@/ui/inputs/EnumSection";
import { MultiSelect } from "@/ui/inputs/MultiSelect";
import { ExperienceSection } from "./ExperienceSection";
import { PerksFilter } from "./PerksFilter";
import {
  EMPLOYMENT_OPTIONS,
  ENGLISH_OPTIONS,
  FIT_OPTIONS,
  FRESHNESS_OPTIONS,
} from "./enum-options";
import type { FiltersApi, OptionRow } from "./types";

type Lens = "cold" | "warm";

// The shared closed-enum filter rail — one widget, both lenses, one FiltersApi.
// Freshness leads (always applied, defaults to the last month). Cold and warm
// differ only by data, not layout: seniority/format option source (aggregate
// counts vs static), the domain search + experience (cold-only; the ranker has
// no domain/experience filter — the CV is the query), and the fit gate
// (warm-only). Section labels are English on both.
export function FilterRail({
  api,
  lens,
  seniorityOptions,
  workFormatOptions,
  domainOptions,
  seniorityToneFor,
}: {
  api: FiltersApi;
  lens: Lens;
  seniorityOptions: OptionRow[];
  workFormatOptions: OptionRow[];
  /** Cold-only searchable domain catalog; omitted → the section is not rendered. */
  domainOptions?: OptionRow[];
  /** Cold seniority pills carry the per-level card tone; warm omits it. */
  seniorityToneFor?: (id: string) => string | undefined;
}) {
  const { filters } = api;

  return (
    <>
      {/* Single-select, no "any": re-clicking the active window keeps it. */}
      <EnumSection
        title="freshness"
        options={FRESHNESS_OPTIONS}
        activeId={filters.freshness}
        onChange={(id) => {
          if (id) api.setFreshness(id);
        }}
      />
      <EnumSection
        title="seniority"
        multiple
        options={seniorityOptions}
        activeIds={filters.seniorities}
        onToggle={api.toggleSeniority}
        activeClassFor={seniorityToneFor}
      />
      <EnumSection
        title="format"
        multiple
        options={workFormatOptions}
        activeIds={filters.workFormats}
        onToggle={api.toggleWorkFormat}
      />
      <EnumSection
        title="english"
        multiple
        options={ENGLISH_OPTIONS}
        activeIds={filters.englishLevels}
        onToggle={api.toggleEnglishLevel}
      />
      <EnumSection
        title="employment"
        multiple
        options={EMPLOYMENT_OPTIONS}
        activeIds={filters.employmentTypes}
        onToggle={api.toggleEmploymentType}
      />
      {lens === "cold" && domainOptions ? (
        <MultiSelect
          title="domain"
          options={domainOptions}
          selected={filters.domainIds}
          onToggle={api.toggleDomain}
          searchable
          searchPlaceholder="search domain…"
        />
      ) : null}
      {lens === "cold" ? (
        <ExperienceSection
          selected={filters.experienceYears}
          onToggle={api.toggleExperience}
        />
      ) : null}
      {lens === "warm" ? (
        <EnumSection
          title="min fit"
          options={FIT_OPTIONS}
          activeId={filters.minFitTier}
          onChange={api.setMinFitTier}
        />
      ) : null}
      <PerksFilter
        reservation={filters.reservation}
        test={filters.test}
        onReservation={api.setReservation}
        onTest={api.setTest}
      />
    </>
  );
}
