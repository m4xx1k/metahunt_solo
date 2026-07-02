"use client";

import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

import type { MatchResponse } from "@/lib/api/ranking";
import {
  vacanciesApi,
  type ListVacanciesQuery,
  type ListVacanciesResponse,
} from "@/lib/api/vacancies";

import type { FilterState } from "./types";
import { coldKey, warmKey } from "./query-keys";
import { fetchMatch, type WarmSource } from "./warm-query";

// The one results hook, shared by both lenses. The queryKey is derived from the
// filter state, so a filter change (committed to the URL via pushState) flips the
// key and refetches client-side — no RSC round-trip. The server dehydrates the
// list for the incoming URL under the same key (see the page HydrationBoundary),
// so the initial key is served from cache without a mount refetch.
// `keepPreviousData` holds the last page visible while the next one loads.

type AnyResults = ListVacanciesResponse | MatchResponse;

interface ColdOpts {
  lens: "cold";
  query: ListVacanciesQuery;
  enabled?: boolean;
}

interface WarmOpts {
  lens: "warm";
  source: WarmSource;
  filters: FilterState;
  page: number;
}

export function useResults(opts: ColdOpts): UseQueryResult<ListVacanciesResponse>;
export function useResults(opts: WarmOpts): UseQueryResult<MatchResponse>;
export function useResults(opts: ColdOpts | WarmOpts): UseQueryResult<AnyResults> {
  const options: UseQueryOptions<AnyResults> =
    opts.lens === "cold"
      ? {
          queryKey: coldKey(opts.query),
          queryFn: () => vacanciesApi.list(opts.query),
          enabled: opts.enabled ?? true,
        }
      : {
          queryKey: warmKey(opts.source, opts.filters, opts.page),
          queryFn: () => fetchMatch(opts.source, opts.filters, opts.page),
        };

  return useQuery({
    ...options,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
