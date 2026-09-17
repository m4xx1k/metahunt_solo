"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { cn, STICKY_RAIL } from "@/lib/utils";
import { useResults } from "@/features/vacancy-filters/use-results";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { FeedListControls } from "@/features/vacancy-filters/FeedListControls";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import type { ListVacanciesResponse } from "@/lib/api/vacancies";
import {
  buildFeedListQuery,
  PAGE_SIZE,
  toCvSubscriptionParams,
  toSubscriptionParams,
} from "./feed-query";
import { FeedFilters } from "./market/FeedFilters";
import { FeedRail } from "./FeedRail";
import { SubscribeCard } from "./subscribe/SubscribeCard";
import { VacancyList } from "./vacancy-list/VacancyList";
import { useRoleSuggestions } from "../_hooks/use-role-suggestions";

const FILTER_SETTLE_MS = 200;

// The scoring viewer in view (a real active CV or a `?sample=`), or null. Drives
// the sort controls, the scored cards and the CV rail; the scores themselves
// still come from the `/feed` response, not from here (MET-144).
export interface FeedViewer {
  candidateId: string;
  isSample: boolean;
  profile: { title: string; role?: string | null; seniority?: string | null };
  onPickCv: (candidateId: string) => void;
  onCandidateGone: (candidateId: string) => void;
  /** Open the file picker — the CV rail owns the only "+ upload" on the page. */
  onUpload: () => void;
  uploading: boolean;
}

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
  sampleIds,
  viewer = null,
  coldRail,
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
  /** Allowlisted sample candidate ids — a `?sample` outside this set is ignored. */
  sampleIds: string[];
  /** A scoring viewer → sort controls, scored cards and the CV rail. */
  viewer?: FeedViewer | null;
  /** Third column when there is no viewer (the CV-recs teaser + sample picks). */
  coldRail?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();
  const filterApi = useUrlFilters();

  // Role fit for the picker only (no URL side effect); undefined without a viewer.
  const roleSuggestions = useRoleSuggestions(viewer?.candidateId ?? "", viewer?.isSample ?? false);

  const presetRoleIds = useMemo(() => (presetRoles ?? []).map((r) => r.id), [presetRoles]);
  const presetSkillIds = useMemo(() => (presetSkills ?? []).map((s) => s.id), [presetSkills]);

  const { query, offset } = useMemo(
    () =>
      buildFeedListQuery(searchParams, {
        trackActive: activeTrackSlug != null,
        presetRoleIds,
        presetSkillIds,
        sources: aggregates.sources,
        sampleIds,
      }),
    [searchParams, activeTrackSlug, presetRoleIds, presetSkillIds, aggregates.sources, sampleIds],
  );

  // Ticking three skills in a row is one intent, not three: settle the filters
  // before fetching so rapid toggles cost one request. Pagination is a single
  // deliberate click, so splice the live page back in — that also keeps the
  // pager, the header count and the rows on the same page during the window.
  const settledFilters = useDebouncedValue(query, FILTER_SETTLE_MS);
  const settledQuery = useMemo(
    () => (settledFilters && query ? { ...settledFilters, page: query.page } : settledFilters),
    [settledFilters, query],
  );
  const settling = query != null && settledFilters !== query;

  // A track with no effective axes matches nothing — render empty, don't query.
  const { data, isFetching } = useResults({
    query: settledQuery ?? { page: 1, pageSize: PAGE_SIZE },
    enabled: settledQuery != null,
  });

  const EMPTY_RESULT: ListVacanciesResponse = {
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    offStackHidden: 0,
  };
  const result: ListVacanciesResponse =
    settledQuery == null ? EMPTY_RESULT : (data ?? EMPTY_RESULT);
  // Present only when the server actually scored the viewer (JWT CV or sample).
  const viewerSkills = data?.viewerSkills ?? null;

  // One subscribe control for both states; only the payload differs. Built off
  // the settled filters, not the live ones — the match-rate count behind this
  // would otherwise fire a request per toggle while the list waits.
  const subscriptionParams = settledQuery
    ? viewer && !viewer.isSample
      ? toCvSubscriptionParams(settledQuery)
      : toSubscriptionParams(settledQuery)
    : null;

  const goToOffset = useCallback(
    (target: number) =>
      push((n) => {
        if (target > 0) n.set("offset", String(target));
        else n.delete("offset");
      }),
    [push],
  );

  const threeCol = viewer != null || coldRail != null;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-8 lg:items-start",
        // The third column only fits from xl. Below it the rail wraps under the
        // filters, but the feed keeps its sidebar — a viewer used to collapse
        // the whole page into one stacked column for every lg-width screen.
        threeCol
          ? "lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_300px]"
          : "lg:grid-cols-[300px_minmax(0,1fr)]",
      )}
    >
      <div className={cn("flex flex-col gap-4", threeCol && STICKY_RAIL)}>
        {subscriptionParams ? (
          <SubscribeCard
            params={subscriptionParams}
            sources={aggregates.sources}
            viewer={
              viewer
                ? {
                    candidateId: viewer.candidateId,
                    label: viewer.profile.title,
                    isSample: viewer.isSample,
                  }
                : null
            }
          />
        ) : null}
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
          hasViewer={viewer != null}
          roleSuggestions={roleSuggestions}
        />
      </div>
      <VacancyList
        result={result}
        offset={offset}
        onNavigate={goToOffset}
        isFetching={isFetching || settling}
        viewerSkills={viewerSkills}
        controls={
          <FeedListControls
            api={filterApi}
            hasViewer={viewer != null}
            offStackHidden={result.offStackHidden}
          />
        }
      />
      {viewer ? (
        <FeedRail
          candidateId={viewer.candidateId}
          viewerSkills={viewerSkills ?? []}
          isSample={viewer.isSample}
          profile={viewer.profile}
          totalVacancies={result.total}
          onPickCv={viewer.onPickCv}
          onCandidateGone={viewer.onCandidateGone}
          onUpload={viewer.onUpload}
          uploading={viewer.uploading}
        />
      ) : coldRail != null ? (
        <div className={STICKY_RAIL}>{coldRail}</div>
      ) : null}
    </div>
  );
}
