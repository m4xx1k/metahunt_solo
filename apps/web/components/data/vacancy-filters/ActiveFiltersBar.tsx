"use client";

import { cn } from "@/lib/utils";
import type { FilterAggregates } from "./types";
import type { FiltersApi } from "./useFilters";

interface Chip {
  key: string;
  label: string;
  tone: string;
  onRemove: () => void;
}

export function ActiveFiltersBar({
  api,
  agg,
}: {
  api: FiltersApi;
  agg: FilterAggregates;
}) {
  const chips = buildChips(api, agg);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border border-border bg-bg-card px-4 py-3 transition-opacity",
        api.activeCount === 0 && "opacity-50",
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        &gt; active filters · {api.activeCount}
      </span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className={cn(
            "inline-flex items-center gap-2 border px-2 py-[2px] font-mono text-[11px] hover:bg-bg-elev",
            c.tone,
          )}
        >
          {c.label}
          <span aria-hidden className="text-text-muted">
            ×
          </span>
        </button>
      ))}
      {api.activeCount === 0 ? (
        <span className="font-mono text-[11px] text-text-muted">nothing selected</span>
      ) : (
        <button
          type="button"
          onClick={api.clear}
          className="ml-auto font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-accent"
        >
          [clear all]
        </button>
      )}
    </div>
  );
}

function buildChips(api: FiltersApi, agg: FilterAggregates): Chip[] {
  const { filters } = api;
  const chips: Chip[] = [];

  if (filters.roleId) {
    const r = agg.roles.find((x) => x.id === filters.roleId);
    if (r) {
      chips.push({
        key: `role-${r.id}`,
        label: `role: ${r.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.setRole(null),
      });
    }
  }
  for (const id of filters.skillIds) {
    const s = agg.skills.find((x) => x.id === id);
    if (s) {
      chips.push({
        key: `skill-${id}`,
        label: `skill: ${s.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.toggleSkill(id),
      });
    }
  }
  if (filters.sourceCode) {
    const s = agg.sources.find((x) => x.code === filters.sourceCode);
    if (s) {
      chips.push({
        key: `src-${s.code}`,
        label: `source: ${s.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.setSource(null),
      });
    }
  }
  if (filters.test !== null) {
    chips.push({
      key: "test",
      label: `test: ${filters.test ? "yes" : "no"}`,
      tone: filters.test
        ? "border-danger text-danger"
        : "border-success text-success",
      onRemove: () => api.setTest(null),
    });
  }
  if (filters.reservation !== null) {
    chips.push({
      key: "reservation",
      label: `reservation: ${filters.reservation ? "yes" : "no"}`,
      tone: filters.reservation
        ? "border-success text-success"
        : "border-text-secondary text-text-primary",
      onRemove: () => api.setReservation(null),
    });
  }

  return chips;
}
