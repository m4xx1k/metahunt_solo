"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  ActiveFiltersBar,
  RoleSection,
  SkillsSection,
  SourceSection,
} from "@/components/data/vacancy-filters";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import { toFilterAggregates } from "./to-filter-aggregates";
import { useUrlFilters } from "./use-url-filters";

// Interactive replacement for the old Snapshot stat widgets. The sidebar
// drives ?role=&skills=&source= in the URL; the server page reads those
// and re-fetches the vacancy list below. Only the three filters the list
// endpoint supports are surfaced (no test / reservation).

export function MarketFilters({
  aggregates,
}: {
  aggregates: VacancyAggregates;
}) {
  const agg = useMemo(() => toFilterAggregates(aggregates), [aggregates]);
  const api = useUrlFilters();

  return (
    <div
      className={cn(
        "flex flex-col gap-4 transition-opacity",
        "lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto",
        api.isPending && "pointer-events-none opacity-50",
      )}
    >
      <ActiveFiltersBar api={api} agg={agg} />
      <aside className="flex flex-col border border-border bg-bg-card">
        <RoleSection
          roles={agg.roles}
          activeId={api.filters.roleId}
          onChange={api.setRole}
        />
        <SkillsSection
          skills={agg.skills}
          selectedIds={api.filters.skillIds}
          onToggle={api.toggleSkill}
        />
        <SourceSection
          sources={agg.sources}
          activeCode={api.filters.sourceCode}
          onChange={api.setSource}
        />
      </aside>
    </div>
  );
}
