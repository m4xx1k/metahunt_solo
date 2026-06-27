// Hand-mirrored types for VacancyAggregatesResponse from
// apps/etl/src/03-discovery/market/market.contract.ts. Per ADR-0005 we duplicate
// types here until a second consumer justifies extracting libs/contracts.

import type { Seniority, WorkFormat } from "./vacancies";
import { apiGet } from "./client";

export interface AggregateSourceCount {
  id: string;
  code: string;
  displayName: string;
  count: number;
}

export interface VacancyAggregates {
  total: number;
  lastSyncAt: string | null;
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  sources: AggregateSourceCount[];
}

export const aggregatesApi = {
  // ISR-cache aggregates for 60s by default: the snapshot only changes on
  // the hourly RSS schedule, so per-request fetches were wasted work.
  get: (init?: RequestInit) =>
    apiGet<VacancyAggregates>(
      "/market/aggregates",
      init ?? { next: { revalidate: 60 } },
    ),
};
