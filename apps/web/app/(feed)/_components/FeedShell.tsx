"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";

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

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
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
    </div>
  );
}
