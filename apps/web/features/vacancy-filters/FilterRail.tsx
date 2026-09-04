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

// The shared filter rail — one widget, both lenses, one FiltersApi. Freshness
// leads (always applied, defaults to the last month), then the searchable
// role / skill catalogs (each renders only when its `*Options` prop is passed:
// role on both lenses, skill cold-only — the warm candidate IS the skill query),
// then the closed enums (seniority · format · english · employment · domain ·
// experience · perks). Lenses differ only in data (seniority/format counts vs
// static), the cold-only skill axis, and the warm-only fit gate (needs a ranked
// result). Section labels are English on both.
export function FilterRail({
  api,
  lens,
  seniorityOptions,
  workFormatOptions,
  domainOptions,
  roleOptions,
  roleExtra,
  skillOptions,
  skillExtra,
  seniorityToneFor,
  hideFreshness = false,
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
  /** Caller-owned note under the role chips (e.g. reduced-estimate hint). */
  roleExtra?: ReactNode;
  /** Searchable must-have skill catalog (cold only); omitted → not rendered. */
  skillOptions?: OptionRow[];
  /** Caller-owned control under the skill chips (e.g. the nice-to-have toggle). */
  skillExtra?: ReactNode;
  /** Cold seniority pills carry the per-level card tone; warm omits it. */
  seniorityToneFor?: (id: string) => string | undefined;
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
          onToggle={api.toggleRole}
          searchable
          searchPlaceholder="search role…"
          extra={roleExtra}
        />
      ) : null}
      {skillOptions ? (
        <MultiSelect
          title="skills"
          options={skillOptions}
          selected={filters.skillIds}
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
