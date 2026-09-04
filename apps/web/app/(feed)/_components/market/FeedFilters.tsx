"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { ActiveFiltersBar } from "@/features/vacancy-filters/ActiveFiltersBar";
import { FilterRail } from "@/features/vacancy-filters/FilterRail";
import { type TrackAxis, TrackAxisSection } from "@/features/tracks/TrackAxisSection";
import { SourceSection } from "@/features/vacancy-filters/SourceSection";
import { TrackTree } from "@/features/tracks/TrackTree";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { SENIORITY_OUTLINE_TONE } from "@/entities/vacancy/SeniorityBadge";
import type { Seniority } from "@/lib/extracted-vacancy";
import type { OptionRow } from "@/features/vacancy-filters/types";
import type { RoleSuggestionsResponse } from "@/lib/api/cv";
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

// The role/skill axes render one of two ways:
// - No active track (landing + the merged home): the shared FilterRail's own
//   searchable role + skill catalogs (the nice-to-have toggle rides the skill
//   section's `extra` slot), summarised by the ActiveFiltersBar on top.
// - Active track (`tracks` passed and `activeTrackSlug` set): both axes render
//   as unified TrackAxisSections (preset chips on by default, contextual
//   suggestions, search-add) writing ?roles / ?skills, each showing its own
//   state; FilterRail's own role/skill catalogs are suppressed. The standalone
//   track route also leads with the browse tree (dropped when `hideTrackTree` —
//   the merged route has a top-band instead).
export function FeedFilters({
  aggregates,
  tracks,
  activeTrackSlug,
  presetRoles,
  presetSkills,
  contextualSkills,
  roleCatalog,
  skillCatalog,
  domainCatalog,
  hideTrackTree = false,
  hasViewer = false,
  roleSuggestions,
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
  /** Full verified-domain catalog. */
  domainCatalog?: TrackAxis[];
  /** Drop the browse tree (the merged route drives tracks from a top-band). */
  hideTrackTree?: boolean;
  /** A scoring viewer is in view → show the min-fit gate + boost suggested roles. */
  hasViewer?: boolean;
  /** Candidate role fit — suggested roles lead the picker with an "N/M fit" label. */
  roleSuggestions?: RoleSuggestionsResponse;
}) {
  const agg = useMemo(() => toFilterAggregates(aggregates), [aggregates]);
  // Role/skill options come from the full /feed catalog (search reaches every
  // node), not the aggregates top-N. Counts only order the empty-query view.
  // Suggested roles first (label carries the honest "N/M fit" numerator), then
  // the searchable catalog. MultiSelect orders unselected chips by count desc,
  // so a synthetic count floats suggestions to the top in suggestion order.
  const roleOptions = useMemo<OptionRow[]>(() => {
    const byId = new Map<string, OptionRow>();
    for (const r of roleCatalog ?? [])
      byId.set(r.id, { id: r.id, label: r.name, count: r.count ?? 0 });
    (roleSuggestions?.items ?? []).forEach((sug, i) => {
      const id = sug.slug ?? sug.roleId;
      byId.set(id, {
        id,
        label: sug.name,
        // A concrete, positive number: jobs in this role your CV already fits.
        hint: `${sug.goodCount} ${sug.goodCount === 1 ? "fit" : "fits"}`,
        count: 1_000_000 - i,
      });
    });
    return [...byId.values()];
  }, [roleCatalog, roleSuggestions]);
  const skillOptions = useMemo<OptionRow[]>(
    () => (skillCatalog ?? []).map((s) => ({ id: s.id, label: s.name, count: s.count ?? 0 })),
    [skillCatalog],
  );
  const domainOptions = useMemo<OptionRow[]>(
    () => (domainCatalog ?? []).map((d) => ({ id: d.id, label: d.name, count: d.count ?? 0 })),
    [domainCatalog],
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
    <div className="flex flex-col gap-3">
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
        {/* Track-mode drops the bar (axis sections show their own state) —
            except when the tree is hidden (merged), where it is the only
            active-filter summary + clear-all. */}
        {trackMode && !hideTrackTree ? null : (
          <ActiveFiltersBar
            api={api}
            agg={agg}
            roles={roleOptions}
            skills={skillOptions}
            domains={domainOptions}
          />
        )}
        <aside className="flex flex-col border border-border bg-bg-card">
          {trackMode && !hideTrackTree ? (
            <TrackTree
              tracks={tracks}
              activeSlug={activeTrackSlug ?? null}
              onSelect={handleSelectTrack}
            />
          ) : null}
          {/* An active track drives the feed from its own preset axes → unified
              TrackAxisSections here. With no active track (landing + the merged
              home) roles and skills are just the FilterRail's searchable
              catalogs below — one widget for both lenses. */}
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
          <FilterRail
            api={api}
            lens={hasViewer ? "warm" : "cold"}
            hideFreshness
            seniorityOptions={agg.seniorities}
            workFormatOptions={agg.workFormats}
            domainOptions={domainOptions}
            roleOptions={showFacets ? undefined : roleOptions}
            roleExtra={
              hasViewer && roleSuggestions?.reduced ? (
                <p className="font-mono text-2xs text-text-muted">
                  rough estimate — add more skills for a sharper role fit
                </p>
              ) : null
            }
            skillOptions={showFacets ? undefined : skillOptions}
            skillExtra={
              !showFacets && api.filters.skillIds.length > 0 ? <SkillScopeToggle /> : undefined
            }
            seniorityToneFor={(id) => SENIORITY_OUTLINE_TONE[id as Seniority]}
          />
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
