// Hand-mirrored types for VacancyAggregatesResponse from
// apps/etl/src/market/market.contract.ts. Per ADR-0005 we duplicate
// types here until a second consumer justifies extracting libs/contracts.

import type { EngagementType, Seniority, WorkFormat } from "./vacancies";
import { apiGet } from "./client";

export interface AggregateSourceCount {
  id: string;
  code: string;
  displayName: string;
  count: number;
}

export interface AggregateSkillCount {
  id: string;
  name: string;
  count: number;
}

/** Same shape for the global aggregate and any per-source slice. */
export interface AggregatesPerSource {
  total: number;
  lastSyncAt: string | null;
  topSkills: AggregateSkillCount[];
  topRoles: AggregateSkillCount[];
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;
  reservationKnownCount: number;
  reservationTrueCount: number;
  salaryDisclosedCount: number;
}

export interface VacancyAggregates extends AggregatesPerSource {
  sources: AggregateSourceCount[];
  /** Keyed by `sources[].code`. */
  bySource: Record<string, AggregatesPerSource>;
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
