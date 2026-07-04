"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cvApi } from "@/lib/api/cv";
import { useResults } from "@/features/vacancy-filters/use-results";
import { MATCH_PAGE_SIZE } from "@/features/vacancy-filters/warm-query";
import type { FilterState } from "@/features/vacancy-filters/types";

// Warm-lens data for /merged: the candidate comes from ?cv (not internal state),
// so this hook is a thin layer over useResults(warm) + recommendations. Page is
// local (warm pagination isn't deep-linked); it resets when the candidate or the
// filters change (React's adjust-state-on-prop-change), so the query never fires
// for an out-of-range page.
export function useMergedWarm(
  candidateId: string | null,
  filters: FilterState,
  showRecs: boolean,
) {
  const [page, setPage] = useState(1);
  const [prev, setPrev] = useState({ candidateId, filters });
  if (prev.candidateId !== candidateId || prev.filters !== filters) {
    setPrev({ candidateId, filters });
    setPage(1);
  }

  const { data, isFetching, isError, error } = useResults({
    lens: "warm",
    candidateId: candidateId ?? "",
    filters,
    page,
    enabled: candidateId != null,
  });

  const { data: rec } = useQuery({
    queryKey: ["recs", candidateId],
    queryFn: () => cvApi.recommendations(candidateId as string),
    enabled: candidateId != null && showRecs,
    staleTime: 30_000,
  });

  const goToOffset = useCallback(
    (offset: number) => setPage(Math.floor(offset / MATCH_PAGE_SIZE) + 1),
    [],
  );

  const errMessage = error instanceof Error ? error.message : "";
  return {
    data,
    rec,
    page,
    pageSize: MATCH_PAGE_SIZE,
    busy: isFetching,
    errorMsg: isError ? errMessage || "request failed" : null,
    // A true 404 means the candidate row is gone (DB reset / GC) — the caller
    // drops it from localStorage and falls back to cold. An empty 200 is not this.
    notFound: isError && /^api 404\b/.test(errMessage),
    goToOffset,
  };
}
