"use client";

import { useState } from "react";

import { EnumSection } from "@/ui/inputs/EnumSection";
import { PerksFilter } from "@/features/vacancy-filters/PerksFilter";
import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";
import { pillClass } from "@/ui/inputs/pill";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_OPTIONS,
  ENGLISH_OPTIONS,
  FIT_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_FORMAT_OPTIONS,
} from "@/features/vacancy-filters/enum-options";
import type { FiltersApi } from "@/features/vacancy-filters/types";

// The reverse-ATS filter sidebar. Consumes the shared FiltersApi (URL-backed),
// so a filter is a bookmarkable query param — the same store the feed uses. A
// sticky column on xl+, collapsed behind one toggle below. The enum sections run
// multi-select (a candidate can want middle ∪ senior).
export function MatchFilters({
  api,
  disabled = false,
}: {
  api: FiltersApi;
  disabled?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { filters } = api;
  const count = api.activeCount;

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
            onToggle={api.toggleSeniority}
          />
          <EnumSection
            title="формат"
            multiple
            options={WORK_FORMAT_OPTIONS}
            activeIds={filters.workFormats}
            onToggle={api.toggleWorkFormat}
          />
          <EnumSection
            title="англійська"
            multiple
            options={ENGLISH_OPTIONS}
            activeIds={filters.englishLevels}
            onToggle={api.toggleEnglishLevel}
          />
          <EnumSection
            title="зайнятість"
            multiple
            options={EMPLOYMENT_OPTIONS}
            activeIds={filters.employmentTypes}
            onToggle={api.toggleEmploymentType}
          />
          <EnumSection
            title="мін. fit"
            options={FIT_OPTIONS}
            activeId={filters.minFitTier}
            onChange={api.setMinFitTier}
          />
          <PerksFilter
            reservation={filters.reservation}
            test={filters.test}
            onReservation={api.setReservation}
            onTest={api.setTest}
          />
          <CollapsibleSection title="свіжість" summary={filters.fresh ? "≤ тиждень" : "any"}>
            <button
              type="button"
              aria-pressed={filters.fresh}
              onClick={() => api.setFresh(!filters.fresh)}
              className={pillClass(filters.fresh)}
            >
              ≤ тиждень
            </button>
          </CollapsibleSection>
        </aside>

        {count > 0 ? (
          <button
            type="button"
            onClick={api.clear}
            className="self-start font-mono text-xs text-text-muted underline hover:text-accent"
          >
            скинути всі фільтри
          </button>
        ) : null}
      </div>
    </div>
  );
}
