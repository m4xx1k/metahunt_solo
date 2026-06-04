// Wire contract for the market-snapshot HTTP API. Kept free of NestJS /
// Drizzle imports so the web client can mirror these types directly.
//
// Global market aggregates over the eligible vacancy set (only vacancies with
// a VERIFIED role node). Powers the public market-snapshot hero — see
// md/journal/migrations/market-snapshot.md.

import type {
  EngagementType,
  Seniority,
  WorkFormat,
} from "../../platform/shared/contract";

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

/**
 * Same shape regardless of whether it's the global aggregate or scoped to a
 * single source. Omits `sources` (which is a global-only directory).
 */
export interface AggregatesPerSource {
  total: number;
  /** ISO-8601. max(loaded_at) over the eligible set. Null if empty. */
  lastSyncAt: string | null;
  /** Up to 10 entries; consumer renders top 8. VERIFIED skills only. */
  topSkills: AggregateSkillCount[];
  /** Up to 6 entries. Roles are always VERIFIED via the eligibility rule. */
  topRoles: AggregateSkillCount[];
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;
  /** Count where `has_reservation IS NOT NULL` — denominator for the share. */
  reservationKnownCount: number;
  /** Count where `has_reservation = true`. */
  reservationTrueCount: number;
  /** Count where salary_min OR salary_max is present. */
  salaryDisclosedCount: number;
}

export interface VacancyAggregatesResponse extends AggregatesPerSource {
  sources: AggregateSourceCount[];
  /**
   * Per-source breakdown keyed by `sources[].code` (e.g. `djinni`, `dou`).
   * Each value carries the same shape as the global aggregate so the UI can
   * swap data slices without changing widget contracts.
   */
  bySource: Record<string, AggregatesPerSource>;
}
