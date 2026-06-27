"use client";

import { cn } from "@/lib/utils";
import { SENIORITY_OUTLINE_TONE } from "@/entities/vacancy/SeniorityBadge";
import type { Seniority } from "@/lib/extracted-vacancy";
import type { FilterAggregates, FiltersApi, OptionRow } from "./types";

interface Chip {
  key: string;
  label: string;
  tone: string;
  onRemove: () => void;
}

export function ActiveFiltersBar({
  api,
  agg,
  roles,
  skills,
  domains,
}: {
  api: FiltersApi;
  agg: FilterAggregates;
  /** Full role/skill catalogs (facets) — selected ids resolve their label here. */
  roles: OptionRow[];
  skills: OptionRow[];
  domains: OptionRow[];
}) {
  const chips = buildChips(api, agg, roles, skills, domains);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border border-border bg-bg-card px-3 py-2.5 transition-opacity",
        api.activeCount === 0 && "opacity-50",
      )}
    >
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        &gt; active filters · {api.activeCount}
      </span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className={cn(
            "inline-flex items-center gap-2 border px-2 py-[2px] font-mono text-2xs hover:bg-bg-elev",
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
        <span className="font-mono text-2xs text-text-muted">nothing selected</span>
      ) : (
        <button
          type="button"
          onClick={api.clear}
          className="ml-auto font-mono text-2xs uppercase tracking-wider text-text-secondary hover:text-accent"
        >
          [clear all]
        </button>
      )}
    </div>
  );
}

function buildChips(
  api: FiltersApi,
  agg: FilterAggregates,
  roles: OptionRow[],
  skills: OptionRow[],
  domains: OptionRow[],
): Chip[] {
  const { filters } = api;
  const chips: Chip[] = [];

  for (const id of filters.roleIds) {
    const r = roles.find((x) => x.id === id);
    if (r) {
      chips.push({
        key: `role-${id}`,
        label: `role: ${r.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.toggleRole(id),
      });
    }
  }
  for (const id of filters.skillIds) {
    const s = skills.find((x) => x.id === id);
    if (s) {
      chips.push({
        key: `skill-${id}`,
        label: `skill: ${s.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.toggleSkill(id),
      });
    }
  }
  for (const id of filters.domainIds) {
    const d = domains.find((x) => x.id === id);
    if (d) {
      chips.push({
        key: `domain-${id}`,
        label: `domain: ${d.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.toggleDomain(id),
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
  if (filters.seniority) {
    const o = agg.seniorities.find((x) => x.id === filters.seniority);
    if (o) {
      chips.push({
        key: `seniority-${o.id}`,
        label: `seniority: ${o.label}`,
        tone:
          SENIORITY_OUTLINE_TONE[o.id as Seniority] ?? "border-accent text-accent",
        onRemove: () => api.setSeniority(null),
      });
    }
  }
  if (filters.workFormat) {
    const o = agg.workFormats.find((x) => x.id === filters.workFormat);
    if (o) {
      chips.push({
        key: `format-${o.id}`,
        label: `format: ${o.label}`,
        tone: "border-accent text-accent",
        onRemove: () => api.setWorkFormat(null),
      });
    }
  }
  if (filters.test !== null) {
    chips.push({
      key: "test",
      label: `test: ${filters.test ? "yes" : "no"}`,
      tone: "border-accent-secondary text-accent-secondary",
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
