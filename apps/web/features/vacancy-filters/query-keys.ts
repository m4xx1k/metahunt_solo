// The one place results query keys are built. Both the client hook (use-results)
// and the server components that dehydrate the SSR seed import these, so a seed
// can never land under a key the client won't look up (which would refetch on
// mount and lose the SSR benefit).

import type { ListVacanciesQuery } from "@/lib/api/vacancies";
import type { FilterState } from "./types";
import { warmFilterKey, type WarmSource } from "./warm-query";

export const coldKey = (query: ListVacanciesQuery) => ["feed", query] as const;

export const warmKey = (source: WarmSource, filters: FilterState, page: number) =>
  ["match", source, warmFilterKey(filters), page] as const;
