"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { FilterRail } from "@/features/vacancy-filters/FilterRail";
import {
  SENIORITY_OPTIONS,
  WORK_FORMAT_OPTIONS,
} from "@/features/vacancy-filters/enum-options";
import type { FiltersApi } from "@/features/vacancy-filters/types";

// The reverse-ATS filter sidebar: the shared FilterRail (warm lens) in a sticky
// column on xl+, collapsed behind one toggle below. Filters live in the URL via
// the shared FiltersApi — the same store the feed uses.
export function MatchFilters({
  api,
  disabled = false,
}: {
  api: FiltersApi;
  disabled?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
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
          <FilterRail
            api={api}
            lens="warm"
            seniorityOptions={SENIORITY_OPTIONS}
            workFormatOptions={WORK_FORMAT_OPTIONS}
          />
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
