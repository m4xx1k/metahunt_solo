"use client";

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  vacanciesApi,
  type ListVacanciesQuery,
  type ListVacanciesResponse,
} from "@/lib/api/vacancies";

import { coldKey } from "./query-keys";

// The feed results hook. The queryKey is derived from the list query, so a
// filter change (committed to the URL via pushState) flips the key and refetches
// client-side — no RSC round-trip. The server dehydrates the list for the
// incoming URL under the same key (see the page HydrationBoundary), so the
// initial key is served from cache without a mount refetch. `keepPreviousData`
// holds the last page visible while the next one loads.
export function useResults(opts: {
  query: ListVacanciesQuery;
  enabled?: boolean;
}): UseQueryResult<ListVacanciesResponse> {
  return useQuery({
    queryKey: coldKey(opts.query),
    queryFn: () => vacanciesApi.list(opts.query),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
