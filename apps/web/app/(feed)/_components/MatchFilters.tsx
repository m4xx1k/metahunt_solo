"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { RoleSuggestionsResponse } from "@/lib/api/cv";
import { FilterRail } from "@/features/vacancy-filters/FilterRail";
import { SENIORITY_OPTIONS, WORK_FORMAT_OPTIONS } from "@/features/vacancy-filters/enum-options";
import type { FiltersApi, OptionRow } from "@/features/vacancy-filters/types";

// The warm-lens filter sidebar: the shared FilterRail (warm lens) in a sticky
// column on xl+, collapsed behind one toggle below. Filters live in the URL via
// the shared FiltersApi — the same store the feed uses.
export function MatchFilters({
  api,
  domainOptions,
  roleCatalog,
  roleSuggestions,
  disabled = false,
}: {
  api: FiltersApi;
  /** Domain catalog for the domain section (same catalog the feed uses). */
  domainOptions?: OptionRow[];
  /** Full ROLE catalog (slug-keyed) so search reaches every role. */
  roleCatalog?: OptionRow[];
  /** Candidate's role fit — suggested roles lead the list with N/M numerators. */
  roleSuggestions?: RoleSuggestionsResponse;
  disabled?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const count = api.activeCount;

  // Suggested roles first (label carries the honest "N/M fit" numerator),
  // then the searchable catalog. MultiSelect orders unselected chips by count
  // desc, so suggestions get a rank-preserving boost above any real count.
  const roleOptions = useMemo<OptionRow[] | undefined>(() => {
    if (!roleCatalog && !roleSuggestions) return undefined;
    const byId = new Map<string, OptionRow>();
    for (const r of roleCatalog ?? []) byId.set(r.id, r);
    (roleSuggestions?.items ?? []).forEach((s, i) => {
      const id = s.slug ?? s.roleId;
      byId.set(id, {
        id,
        label: `${s.name} · ${s.goodCount}/${s.totalCount} fit`,
        count: 1_000_000 - i,
      });
    });
    return [...byId.values()];
  }, [roleCatalog, roleSuggestions]);

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
        <span>&gt; filters{count > 0 ? ` · ${count}` : ""}</span>
        <span aria-hidden>{mobileOpen ? "[− hide]" : "[+ show]"}</span>
      </button>

      <div className={cn("flex-col gap-3 xl:flex", mobileOpen ? "flex" : "hidden")}>
        <aside className="flex flex-col border border-border bg-bg-card">
          <FilterRail
            api={api}
            lens="warm"
            seniorityOptions={SENIORITY_OPTIONS}
            workFormatOptions={WORK_FORMAT_OPTIONS}
            domainOptions={domainOptions}
            roleOptions={roleOptions}
            roleExtra={
              roleSuggestions?.reduced ? (
                <p className="font-mono text-2xs text-text-muted">
                  rough estimate — add more skills for a sharper role fit
                </p>
              ) : null
            }
          />
        </aside>

        {count > 0 ? (
          <button
            type="button"
            onClick={api.clear}
            className="self-start font-mono text-xs text-text-muted underline hover:text-accent"
          >
            reset all filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
