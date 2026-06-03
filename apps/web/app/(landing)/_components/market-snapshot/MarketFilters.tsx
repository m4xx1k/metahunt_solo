"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  ActiveFiltersBar,
  EnumSection,
  type Facet,
  FacetSection,
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

// Two layouts share this component:
// - Landing (no `tracks`): flat single-select RoleSection + skill multiselect,
//   with the ActiveFiltersBar summary on top. Unchanged.
// - Track route (`tracks` passed): leads with the browse tree; once a track is
//   active, both axes render as unified FacetSections (preset chips on by
//   default, contextual suggestions, search-add) writing ?roles / ?skills.
//   The feed is driven by those explicit axes, so the bar is dropped here —
//   each section shows its own state.
export function MarketFilters({
  aggregates,
  tracks,
  activeTrackSlug,
  presetRoles,
  presetSkills,
  contextualSkills,
  roleCatalog,
  skillCatalog,
}: {
  aggregates: VacancyAggregates;
  tracks?: TrackDto[];
  activeTrackSlug?: string | null;
  /** The active track's preset ROLE nodes (on by default in the facet). */
  presetRoles?: Facet[];
  /** The active track's preset SKILL nodes. */
  presetSkills?: Facet[];
  /** Contextual skills ranked for the active track (facet suggestions). */
  contextualSkills?: Facet[];
  /** Full verified-role catalog — search-and-add in the role facet. */
  roleCatalog?: Facet[];
  /** Full verified-skill catalog — search-and-add in the skill facet. */
  skillCatalog?: Facet[];
}) {
  const agg = useMemo(() => toFilterAggregates(aggregates), [aggregates]);
  const api = useUrlFilters();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const trackMode = tracks != null;
  const showFacets = trackMode && activeTrackSlug != null;

  // Picking a track is a fresh context: navigate to its route and drop any
  // prior refine query (the new track's own preset becomes the defaults).
  const handleSelectTrack = useCallback(
    (slug: string) => router.push(`/track/${encodeURIComponent(slug)}`),
    [router],
  );

  const handleToggleMobile = useCallback(() => setMobileOpen((v) => !v), []);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity",
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

      <div className={cn("flex-col gap-3 lg:flex", mobileOpen ? "flex" : "hidden")}>
        {trackMode ? null : <ActiveFiltersBar api={api} agg={agg} />}
        <aside className="flex flex-col border border-border bg-bg-card">
          {trackMode ? (
            <>
              <TrackTree
                tracks={tracks}
                activeSlug={activeTrackSlug ?? null}
                onSelect={handleSelectTrack}
              />
              {showFacets ? (
                <>
                  <FacetSection
                    title="refine · roles"
                    urlKey="roles"
                    addLabel="add role…"
                    presets={presetRoles ?? []}
                    catalog={roleCatalog ?? []}
                  />
                  <FacetSection
                    title="skills"
                    urlKey="skills"
                    addLabel="add skill…"
                    presets={presetSkills ?? []}
                    catalog={skillCatalog ?? []}
                    suggestions={contextualSkills ?? []}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
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
            </>
          )}
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
