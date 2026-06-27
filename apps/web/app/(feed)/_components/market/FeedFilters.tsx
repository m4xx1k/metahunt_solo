"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { ActiveFiltersBar } from "@/features/vacancy-filters/ActiveFiltersBar";
import { EnumSection } from "@/ui/inputs/EnumSection";
import { MultiSelect } from "@/ui/inputs/MultiSelect";
import { type TrackAxis, TrackAxisSection } from "@/features/tracks/TrackAxisSection";
import { PerksFilter } from "@/features/vacancy-filters/PerksFilter";
import { SourceSection } from "@/features/vacancy-filters/SourceSection";
import { TrackTree } from "@/features/tracks/TrackTree";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { SENIORITY_OUTLINE_TONE } from "@/entities/vacancy/SeniorityBadge";
import type { Seniority } from "@/lib/extracted-vacancy";
import type { OptionRow } from "@/features/vacancy-filters/types";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { DedupeToggle } from "./DedupeToggle";
import { SkillScopeToggle } from "./SkillScopeToggle";
import { toFilterAggregates } from "./to-filter-aggregates";

// Interactive replacement for the old Snapshot stat widgets. The sidebar
// drives the filter query string; the server page reads it and re-fetches
// the vacancy list. On <lg the whole panel collapses behind one toggle so
// it never pushes the list off the first screen; on lg+ it is a sticky
// always-visible column.

// Two layouts share this component:
// - Landing (no `tracks`): role + skill MultiSelects (both multi, searchable;
//   the nice-to-have toggle rides the skill section's `extra` slot), with the
//   ActiveFiltersBar summary on top.
// - Track route (`tracks` passed): leads with the browse tree; once a track is
//   active, both axes render as unified TrackAxisSections (preset chips on by
//   default, contextual suggestions, search-add) writing ?roles / ?skills.
//   The feed is driven by those explicit axes, so the bar is dropped here —
//   each section shows its own state.
export function FeedFilters({
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
  presetRoles?: TrackAxis[];
  /** The active track's preset SKILL nodes. */
  presetSkills?: TrackAxis[];
  /** Contextual skills ranked for the active track (facet suggestions). */
  contextualSkills?: TrackAxis[];
  /** Full verified-role catalog — search-and-add in the role facet. */
  roleCatalog?: TrackAxis[];
  /** Full verified-skill catalog — search-and-add in the skill facet. */
  skillCatalog?: TrackAxis[];
}) {
  const agg = useMemo(() => toFilterAggregates(aggregates), [aggregates]);
  // Role/skill options come from the full /feed catalog (search reaches every
  // node), not the aggregates top-N. Counts only order the empty-query view.
  const roleOptions = useMemo<OptionRow[]>(
    () =>
      (roleCatalog ?? []).map((r) => ({ id: r.id, label: r.name, count: r.count ?? 0 })),
    [roleCatalog],
  );
  const skillOptions = useMemo<OptionRow[]>(
    () =>
      (skillCatalog ?? []).map((s) => ({ id: s.id, label: s.name, count: s.count ?? 0 })),
    [skillCatalog],
  );
  const api = useUrlFilters();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const trackMode = tracks != null;
  const showFacets = trackMode && activeTrackSlug != null;

  // Picking a track is a fresh context: navigate to its route and drop any
  // prior refine query (the new track's own preset becomes the defaults).
  const handleSelectTrack = useCallback(
    (slug: string) => router.push(`/${encodeURIComponent(slug)}`),
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
        className="flex items-center justify-between border border-border bg-bg-card px-3 py-2 font-mono text-2xs uppercase tracking-wider text-text-secondary hover:text-accent lg:hidden"
      >
        <span>
          &gt; filters
          {api.activeCount > 0 ? ` · ${api.activeCount}` : ""}
        </span>
        <span aria-hidden>{mobileOpen ? "[− hide]" : "[+ show]"}</span>
      </button>

      <div className={cn("flex-col gap-3 lg:flex", mobileOpen ? "flex" : "hidden")}>
        <DedupeToggle />
        {trackMode ? null : (
          <ActiveFiltersBar
            api={api}
            agg={agg}
            roles={roleOptions}
            skills={skillOptions}
          />
        )}
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
                  <TrackAxisSection
                    title="refine · roles"
                    urlKey="roles"
                    addLabel="add role…"
                    presets={presetRoles ?? []}
                    catalog={roleCatalog ?? []}
                  />
                  <TrackAxisSection
                    title="skills"
                    urlKey="skills"
                    addLabel="add skill…"
                    presets={presetSkills ?? []}
                    catalog={skillCatalog ?? []}
                    suggestions={contextualSkills ?? []}
                  />
                  <div className="border-b border-border px-4 py-3 last:border-b-0">
                    <SkillScopeToggle />
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <MultiSelect
                title="role"
                options={roleOptions}
                selected={api.filters.roleIds}
                onToggle={api.toggleRole}
                searchable
                searchPlaceholder="search role…"
              />
              <MultiSelect
                title="skills"
                options={skillOptions}
                selected={api.filters.skillIds}
                onToggle={api.toggleSkill}
                searchable
                searchPlaceholder="search skill…"
                extra={
                  api.filters.skillIds.length > 0 ? <SkillScopeToggle /> : null
                }
              />
            </>
          )}
          <EnumSection
            title="seniority"
            options={agg.seniorities}
            activeId={api.filters.seniority}
            onChange={api.setSeniority}
            activeClassFor={(id) => SENIORITY_OUTLINE_TONE[id as Seniority]}
          />
          {/* Perks rank above format — reservation is a strong draw for the
              UA market. */}
          <PerksFilter
            reservation={api.filters.reservation}
            test={api.filters.test}
            onReservation={api.setReservation}
            onTest={api.setTest}
          />
          <EnumSection
            title="format"
            options={agg.workFormats}
            activeId={api.filters.workFormat}
            onChange={api.setWorkFormat}
          />
          {/* Domain MultiSelect slots here once the /feed/domains facet +
              domainIds list filter land (separate commit). */}
          <SourceSection
            sources={agg.sources}
            activeCode={api.filters.sourceCode}
            onChange={api.setSource}
          />
        </aside>
      </div>
    </div>
  );
}
