"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useResults } from "@/features/vacancy-filters/use-results";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import type { ListVacanciesResponse } from "@/lib/api/vacancies";
import { buildFeedListQuery, PAGE_SIZE, toSubscriptionParams } from "./feed-query";
import { FeedFilters } from "./market/FeedFilters";
import { SubscribeButton } from "./subscribe/SubscribeButton";
import { VacancyList } from "./vacancy-list/VacancyList";

// The interactive feed grid: server-seeded, client-driven. Reads the URL, reads
// the list from the react-query cache the server dehydrated for this URL, and
// refetches client-side on every filter change (the store commits shallowly, no
// RSC round-trip). The static chrome (header, hero, footer) stays in the server
// page — it doesn't depend on filters.
export function FeedShell({
  aggregates,
  tracks,
  activeTrackSlug,
  presetRoles,
  presetSkills,
  contextualSkills,
  roleCatalog,
  skillCatalog,
  domainCatalog,
  hideTrackTree,
  rightRail,
}: {
  aggregates: VacancyAggregates;
  tracks?: TrackDto[];
  activeTrackSlug?: string | null;
  presetRoles?: TrackAxis[];
  presetSkills?: TrackAxis[];
  contextualSkills?: TrackAxis[];
  roleCatalog?: TrackAxis[];
  skillCatalog?: TrackAxis[];
  domainCatalog?: TrackAxis[];
  /** Drop the sidebar browse tree (the merged route uses a top-band instead). */
  hideTrackTree?: boolean;
  /** Optional third column (merged cold lens: the CV-recs teaser). Its presence
   *  switches the grid to 3-col and makes both side rails self-scroll. */
  rightRail?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();

  const presetRoleIds = useMemo(
    () => (presetRoles ?? []).map((r) => r.id),
    [presetRoles],
  );
  const presetSkillIds = useMemo(
    () => (presetSkills ?? []).map((s) => s.id),
    [presetSkills],
  );

  const { query, offset } = useMemo(
    () =>
      buildFeedListQuery(searchParams, {
        trackActive: activeTrackSlug != null,
        presetRoleIds,
        presetSkillIds,
        sources: aggregates.sources,
      }),
    [searchParams, activeTrackSlug, presetRoleIds, presetSkillIds, aggregates.sources],
  );

  // A track with no effective axes matches nothing — render empty, don't query.
  const { data, isFetching } = useResults({
    lens: "cold",
    query: query ?? { page: 1, pageSize: PAGE_SIZE },
    enabled: query != null,
  });

  const result: ListVacanciesResponse =
    query == null
      ? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 }
      : (data ?? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 });

  const subscriptionParams = query ? toSubscriptionParams(query) : null;

  const goToOffset = useCallback(
    (target: number) =>
      push((n) => {
        if (target > 0) n.set("offset", String(target));
        else n.delete("offset");
      }),
    [push],
  );

  const threeCol = rightRail != null;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-8 lg:items-start",
        threeCol
          ? "xl:grid-cols-[300px_minmax(0,1fr)_300px]"
          : "lg:grid-cols-[300px_minmax(0,1fr)]",
      )}
    >
      <div className={cn("flex flex-col gap-4", threeCol && STICKY_RAIL)}>
        {subscriptionParams ? <SubscribeButton params={subscriptionParams} /> : null}
        <FeedFilters
          aggregates={aggregates}
          tracks={tracks}
          activeTrackSlug={activeTrackSlug}
          presetRoles={presetRoles}
          presetSkills={presetSkills}
          contextualSkills={contextualSkills}
          roleCatalog={roleCatalog}
          skillCatalog={skillCatalog}
          domainCatalog={domainCatalog}
          hideTrackTree={hideTrackTree}
          isFetching={isFetching}
        />
      </div>
      <VacancyList
        result={result}
        offset={offset}
        onNavigate={goToOffset}
        isFetching={isFetching}
      />
      {threeCol ? <div className={STICKY_RAIL}>{rightRail}</div> : null}
    </div>
  );
}

// A tall sidebar was getting its bottom clipped: sticky pins it, but content
// past the viewport was only reachable by scrolling the whole page. Capping the
// height and letting the rail scroll itself keeps its bottom always reachable.
const STICKY_RAIL =
  "xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]";
