"use client";

import { EnumSection } from "@/ui/inputs/EnumSection";
import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";
import { pillClass } from "@/ui/inputs/pill";
import { ExperienceSection } from "./ExperienceSection";
import { PerksFilter } from "./PerksFilter";
import {
  EMPLOYMENT_OPTIONS,
  ENGLISH_OPTIONS,
  FIT_OPTIONS,
} from "./enum-options";
import type { FiltersApi, OptionRow } from "./types";

type Lens = "cold" | "warm";

// Per-lens section titles: the cold feed reads in English, the warm candidate
// page in Ukrainian. (These are user-facing copy, not identifiers.)
const LABELS: Record<Lens, Record<string, string>> = {
  cold: {
    seniority: "seniority",
    format: "format",
    english: "english",
    employment: "employment",
    fit: "min fit",
    fresh: "freshness",
    freshOn: "≤ 1 week",
  },
  warm: {
    seniority: "рівень",
    format: "формат",
    english: "англійська",
    employment: "зайнятість",
    fit: "мін. fit",
    fresh: "свіжість",
    freshOn: "≤ тиждень",
  },
};

// The shared closed-enum filter rail — one widget, both lenses, one FiltersApi.
// Cold (feed) and warm (reverse-ATS) differ only in: seniority/format option
// source (aggregate counts vs static), the fit gate (warm-only), experience
// (cold-only), and section wording. Roles/skills/domains/source/tracks stay
// with the feed; CV widgets stay with reverse-ATS — this is just the enums.
export function FilterRail({
  api,
  lens,
  seniorityOptions,
  workFormatOptions,
  seniorityToneFor,
}: {
  api: FiltersApi;
  lens: Lens;
  seniorityOptions: OptionRow[];
  workFormatOptions: OptionRow[];
  /** Cold seniority pills carry the per-level card tone; warm omits it. */
  seniorityToneFor?: (id: string) => string | undefined;
}) {
  const { filters } = api;
  const t = LABELS[lens];

  return (
    <>
      <EnumSection
        title={t.seniority}
        multiple
        options={seniorityOptions}
        activeIds={filters.seniorities}
        onToggle={api.toggleSeniority}
        activeClassFor={seniorityToneFor}
      />
      <EnumSection
        title={t.format}
        multiple
        options={workFormatOptions}
        activeIds={filters.workFormats}
        onToggle={api.toggleWorkFormat}
      />
      <EnumSection
        title={t.english}
        multiple
        options={ENGLISH_OPTIONS}
        activeIds={filters.englishLevels}
        onToggle={api.toggleEnglishLevel}
      />
      <EnumSection
        title={t.employment}
        multiple
        options={EMPLOYMENT_OPTIONS}
        activeIds={filters.employmentTypes}
        onToggle={api.toggleEmploymentType}
      />
      {lens === "cold" ? (
        <ExperienceSection
          selected={filters.experienceYears}
          onToggle={api.toggleExperience}
        />
      ) : null}
      {lens === "warm" ? (
        <EnumSection
          title={t.fit}
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
      <CollapsibleSection title={t.fresh} summary={filters.fresh ? t.freshOn : "any"}>
        <button
          type="button"
          aria-pressed={filters.fresh}
          onClick={() => api.setFresh(!filters.fresh)}
          className={pillClass(filters.fresh)}
        >
          {t.freshOn}
        </button>
      </CollapsibleSection>
    </>
  );
}
