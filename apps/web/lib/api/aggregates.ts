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

export interface VacancyAggregates {
  total: number;
  /** ISO-8601. max(loaded_at) over the eligible set. Null if empty. */
  lastSyncAt: string | null;
  sources: AggregateSourceCount[];
  /** Up to 10; the snapshot UI renders top 8. */
  topSkills: AggregateSkillCount[];
  /** Up to 6 entries. */
  topRoles: AggregateSkillCount[];
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;
  reservationKnownCount: number;
  reservationTrueCount: number;
  salaryDisclosedCount: number;
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, init ?? { cache: "no-store" });
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
