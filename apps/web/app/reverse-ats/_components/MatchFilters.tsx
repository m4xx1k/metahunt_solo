"use client";

import { useState } from "react";

import { EnumSection } from "@/ui/inputs/EnumSection";
import { PerksFilter } from "@/features/vacancy-filters/PerksFilter";
import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";
import { pillClass } from "@/ui/inputs/pill";
import { cn } from "@/lib/utils";
import type { FitTier } from "@/lib/api/ranking";
import type {
  EmploymentType,
  EnglishLevel,
  Seniority,
  WorkFormat,
} from "@/lib/api/vacancies";
import {
  EMPLOYMENT_OPTIONS,
  ENGLISH_OPTIONS,
  FIT_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_FORMAT_OPTIONS,
  activeFilterCount,
  hasActiveFilters,
  toggleIn,
  type Filters,
  NO_FILTERS,
} from "./filter-model";

// The reverse-ATS filter sidebar. Mirrors the feed's FeedFilters: a sticky
// always-visible column on lg+, collapsed behind one toggle on <lg so it never
// pushes the results below the fold. Reuses the same tier-2 section primitives
// (EnumSection, PerksFilter, Section) the feed uses — the only difference is the
// enum sections run in multi-select mode (a candidate can want middle ∪ senior).
export function MatchFilters({
  filters,
  onChange,
  disabled = false,
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  disabled?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        className="flex items-center justify-between border border-border bg-bg-card px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-accent xl:hidden"
      >
        <span>
          &gt; фільтри{count > 0 ? ` · ${count}` : ""}
        </span>
        <span aria-hidden>{mobileOpen ? "[− сховати]" : "[+ показати]"}</span>
      </button>

      <div className={cn("flex-col gap-3 xl:flex", mobileOpen ? "flex" : "hidden")}>
        <aside className="flex flex-col border border-border bg-bg-card">
          <EnumSection
            title="рівень"
            multiple
            options={SENIORITY_OPTIONS}
            activeIds={filters.seniorities}
            onToggle={(id) =>
              onChange({ seniorities: toggleIn(filters.seniorities, id as Seniority) })
            }
          />
          <EnumSection
            title="формат"
            multiple
            options={WORK_FORMAT_OPTIONS}
            activeIds={filters.workFormats}
            onToggle={(id) =>
              onChange({ workFormats: toggleIn(filters.workFormats, id as WorkFormat) })
            }
          />
          <EnumSection
            title="англійська"
            multiple
            options={ENGLISH_OPTIONS}
            activeIds={filters.englishLevels}
            onToggle={(id) =>
              onChange({ englishLevels: toggleIn(filters.englishLevels, id as EnglishLevel) })
            }
          />
          <EnumSection
            title="зайнятість"
            multiple
            options={EMPLOYMENT_OPTIONS}
            activeIds={filters.employmentTypes}
            onToggle={(id) =>
              onChange({
                employmentTypes: toggleIn(filters.employmentTypes, id as EmploymentType),
              })
            }
          />
          <EnumSection
            title="мін. fit"
            options={FIT_OPTIONS}
            activeId={filters.minFitTier}
            onChange={(id) => onChange({ minFitTier: (id as FitTier) ?? null })}
          />
          <PerksFilter
            reservation={filters.reservation ? true : null}
            test={filters.noTest ? false : null}
            onReservation={(v) => onChange({ reservation: v === true })}
            onTest={(v) => onChange({ noTest: v === false })}
          />
          <CollapsibleSection title="свіжість" summary={filters.fresh ? "≤ тиждень" : "any"}>
            <button
              type="button"
              aria-pressed={filters.fresh}
              onClick={() => onChange({ fresh: !filters.fresh })}
              className={pillClass(filters.fresh)}
            >
              ≤ тиждень
            </button>
          </CollapsibleSection>
        </aside>

        {hasActiveFilters(filters) ? (
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            className="self-start font-mono text-xs text-text-muted underline hover:text-accent"
          >
            скинути всі фільтри
          </button>
        ) : null}
      </div>
    </div>
  );
}
