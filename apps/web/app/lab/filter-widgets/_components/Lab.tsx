"use client";

import {
  ActiveFiltersBar,
  FilterSidebar,
  useFilters,
} from "@/components/data/vacancy-filters";
import { MOCK_AGGREGATES } from "./mockData";
import { ResultsPlaceholder } from "./ResultsPlaceholder";

export function Lab() {
  const api = useFilters();
  return (
    <div className="flex flex-col gap-4">
      <ActiveFiltersBar api={api} agg={MOCK_AGGREGATES} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[300px_1fr]">
        <FilterSidebar api={api} agg={MOCK_AGGREGATES} />
        <ResultsPlaceholder />
      </div>
    </div>
  );
}
