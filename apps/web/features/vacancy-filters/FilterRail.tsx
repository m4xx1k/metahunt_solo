"use client";

import type { ReactNode } from "react";

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
// Freshness leads (always applied, defaults to the last month). Both lenses share
// the same section order (seniority · format · english · employment · domain ·
// experience · perks); they differ only in data (seniority/format counts vs
// static) and the warm-only fit gate. Domain renders whenever a catalog is passed
// (both lenses filter vacancies by domain); the fit gate needs a ranked result.
// Section labels are English on both.
export function FilterRail({
  api,
  lens,
  seniorityOptions,
  workFormatOptions,
  domainOptions,
  roleOptions,
  roleExtra,
  seniorityToneFor,
}: {
  api: FiltersApi;
  lens: Lens;
  seniorityOptions: OptionRow[];
  workFormatOptions: OptionRow[];
  /** Searchable domain catalog; omitted → the section is not rendered. */
  domainOptions?: OptionRow[];
  /** Searchable role catalog (warm hard filter); omitted → not rendered. */
  roleOptions?: OptionRow[];
  /** Caller-owned note under the role chips (e.g. reduced-estimate hint). */
  roleExtra?: ReactNode;
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
      {roleOptions ? (
        <MultiSelect
          title="role"
          options={roleOptions}
          selected={filters.roleIds}
          onToggle={api.toggleRole}
          searchable
          searchPlaceholder="search role…"
          extra={roleExtra}
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
    </>
  );
}
