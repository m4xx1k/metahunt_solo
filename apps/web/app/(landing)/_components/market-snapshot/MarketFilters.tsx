"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  ActiveFiltersBar,
  EnumSection,
  FlagSection,
  RoleSection,
  SkillsSection,
  SourceSection,
  TrackTree,
} from "./filters";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { toFilterAggregates } from "./to-filter-aggregates";
import { useUrlFilters } from "./use-url-filters";

// Interactive replacement for the old Snapshot stat widgets. The sidebar
// drives the filter query string; the server page reads it and re-fetches
// the vacancy list. On <lg the whole panel collapses behind one toggle so
// it never pushes the list off the first screen; on lg+ it is a sticky
// always-visible column.

// When `tracks` is passed (the /track prototype route) the sidebar leads
// with the browse tree and selecting a node navigates to that track's page;
// the flat RoleSection is dropped in that mode. Without it, the landing
// keeps its current flat-role behavior untouched.
export function MarketFilters({
  aggregates,
  tracks,
  activeTrackSlug,
}: {
  aggregates: VacancyAggregates;
  tracks?: TrackDto[];
  activeTrackSlug?: string | null;
}) {
  const agg = useMemo(() => toFilterAggregates(aggregates), [aggregates]);
  const api = useUrlFilters();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Picking a track is a fresh context: navigate to its route and drop any
  // prior refine query (lazy-refine starts from the track's own criteria).
  const handleSelectTrack = useCallback(
    (slug: string) => router.push(`/track/${encodeURIComponent(slug)}`),
    [router],
  );

  const handleToggleMobile = useCallback(
    () => setMobileOpen((v) => !v),
    [],
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity",
        // "lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto",
        api.isPending && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        onClick={handleToggleMobile}
        aria-expanded={mobileOpen}
        className="flex items-center justify-between border border-border bg-bg-card px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-accent lg:hidden"
      >
        <span>
          &gt; filters
          {api.activeCount > 0 ? ` · ${api.activeCount}` : ""}
        </span>
        <span aria-hidden>{mobileOpen ? "[− hide]" : "[+ show]"}</span>
      </button>

      <div
        className={cn(
          "flex-col gap-3 lg:flex",
          mobileOpen ? "flex" : "hidden",
        )}
      >
        <ActiveFiltersBar api={api} agg={agg} />
        <aside className="flex flex-col border border-border bg-bg-card">
          {tracks ? (
            <TrackTree
              tracks={tracks}
              activeSlug={activeTrackSlug ?? null}
              onSelect={handleSelectTrack}
            />
          ) : (
            <RoleSection
              roles={agg.roles}
              activeId={api.filters.roleId}
              onChange={api.setRole}
            />
          )}
          <SkillsSection
            skills={agg.skills}
            selectedIds={api.filters.skillIds}
            onToggle={api.toggleSkill}
          />
          <EnumSection
            title="seniority"
            options={agg.seniorities}
            activeId={api.filters.seniority}
            onChange={api.setSeniority}
          />
          <EnumSection
            title="format"
            options={agg.workFormats}
            activeId={api.filters.workFormat}
            onChange={api.setWorkFormat}
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
          />
          <FlagSection
            title="reservation"
            value={api.filters.reservation}
            onChange={api.setReservation}
          />
        </aside>
      </div>
    </div>
  );
}
