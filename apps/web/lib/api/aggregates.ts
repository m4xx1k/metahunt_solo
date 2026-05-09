// Hand-mirrored types for VacancyAggregatesResponse from
// apps/etl/src/vacancies/vacancies.contract.ts. Per ADR-0005 we duplicate
// types here until a second consumer justifies extracting libs/contracts.

import type { EngagementType, Seniority, WorkFormat } from "./vacancies";

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

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  // Default: ISR-cache aggregates for 60s. The snapshot data only changes
  // every hour (RSS schedule) so per-request fetches were wasted work.
  const res = await fetch(
    url,
    init ?? ({ next: { revalidate: 60 } } as RequestInit),
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`aggregates api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const aggregatesApi = {
  get: (init?: RequestInit) =>
    get<VacancyAggregates>("/vacancies/aggregates", init),
};
