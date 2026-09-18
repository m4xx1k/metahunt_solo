"use client";

import type { ReactNode } from "react";

import { EnumSection } from "@/ui/inputs/EnumSection";
import { MultiSelect } from "@/ui/inputs/MultiSelect";
import { ExperienceSection } from "./ExperienceSection";
import { MoreFilters } from "./MoreFilters";
import { PerksFilter } from "./PerksFilter";
import {
  EMPLOYMENT_OPTIONS,
  ENGLISH_OPTIONS,
  FIT_OPTIONS,
  FRESHNESS_OPTIONS,
} from "./enum-options";
import { countHiddenFilters, type FiltersApi, type OptionRow } from "./types";

type Lens = "cold" | "warm";

// One widget, both lenses, one FiltersApi. Role, skills and seniority stay open;
// every other axis sits behind the one disclosure.
export function FilterRail({
  api,
  lens,
  seniorityOptions,
  workFormatOptions,
  domainOptions,
  roleOptions,
  skillOptions,
  selectedOptions,
  skillExtra,
  seniorityToneFor,
  hideFreshness = false,
  hiddenExtra,
  hiddenActiveExtra = 0,
}: {
  api: FiltersApi;
  lens: Lens;
  /** The feed shows freshness in its results-header strip instead. */
  hideFreshness?: boolean;
  seniorityOptions: OptionRow[];
  workFormatOptions: OptionRow[];
  /** Searchable domain catalog; omitted → the section is not rendered. */
  domainOptions?: OptionRow[];
  /** Searchable role catalog (warm hard filter); omitted → not rendered. */
  roleOptions?: OptionRow[];
  /** Searchable must-have skill catalog (cold only); omitted → not rendered. */
  skillOptions?: OptionRow[];
  /**
   * Labels for refs that may sit outside the catalogs above — a saved filter can
   * name a role or skill with no vacancies right now, and the catalogs only
   * carry ones that have them. Each section reads only its own selected ids, so
   * one combined list is safe to pass to all of them.
   */
  selectedOptions?: OptionRow[];
  /** Caller-owned control under the skill chips (e.g. the nice-to-have toggle). */
  skillExtra?: ReactNode;
  /** Cold seniority pills carry the per-level card tone; warm omits it. */
  seniorityToneFor?: (id: string) => string | undefined;
  /** Caller-owned sections that belong behind the disclosure (source, dedupe). */
  hiddenExtra?: ReactNode;
  /** How many of `hiddenExtra`'s own controls are currently set. */
  hiddenActiveExtra?: number;
}) {
  const { filters } = api;

  return (
    <>
      {/* Single-select, no "any": re-clicking the active window keeps it. */}
      {hideFreshness ? null : (
        <EnumSection
          title="freshness"
          options={FRESHNESS_OPTIONS}
          activeId={filters.freshness}
          onChange={(id) => {
            if (id) api.setFreshness(id);
          }}
        />
      )}
      {roleOptions ? (
        <MultiSelect
          title="role"
          options={roleOptions}
          selected={filters.roleIds}
          selectedOptions={selectedOptions}
          onToggle={api.toggleRole}
          searchable
          searchPlaceholder="search role…"
          layout="rows"
        />
      ) : null}
      {skillOptions ? (
        <MultiSelect
          title="skills"
          options={skillOptions}
          selected={filters.skillIds}
          selectedOptions={selectedOptions}
          onToggle={api.toggleSkill}
          searchable
          searchPlaceholder="search skill…"
          extra={skillExtra}
        />
      ) : null}
      <EnumSection
        title="seniority"
        multiple
        options={seniorityOptions}
        activeIds={filters.seniorities}
        onToggle={api.toggleSeniority}
        activeClassFor={seniorityToneFor}
      />
      <MoreFilters activeCount={countHiddenFilters(filters) + hiddenActiveExtra}>
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
        {domainOptions ? (
          <MultiSelect
            title="domain"
            options={domainOptions}
            selected={filters.domainIds}
            selectedOptions={selectedOptions}
            onToggle={api.toggleDomain}
            searchable
            searchPlaceholder="search domain…"
          />
        ) : null}
        <ExperienceSection selected={filters.experienceYears} onToggle={api.toggleExperience} />
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
        {hiddenExtra}
      </MoreFilters>
    </>
  );
}
