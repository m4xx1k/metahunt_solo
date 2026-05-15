"use client";

import { FlagSection } from "./FlagSection";
import { RoleSection } from "./RoleSection";
import { SkillsSection } from "./SkillsSection";
import { SourceSection } from "./SourceSection";
import type { FilterAggregates } from "./types";
import type { FiltersApi } from "./useFilters";

// Thin composer. Maps the filter API + aggregates into the primitive
// props each section needs — no section touches the full api/agg shape.

export function FilterSidebar({
  api,
  agg,
}: {
  api: FiltersApi;
  agg: FilterAggregates;
}) {
  return (
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
      <FlagSection
        title="test task"
        value={api.filters.test}
        onChange={api.setTest}
        agg={agg.test}
      />
      <FlagSection
        title="reservation"
        value={api.filters.reservation}
        onChange={api.setReservation}
        agg={agg.reservation}
      />
    </aside>
  );
}
