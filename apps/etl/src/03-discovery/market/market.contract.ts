// Wire contract for the market-snapshot HTTP API. Kept free of NestJS /
// Drizzle imports so the web client can mirror these types directly.
//
// Global market aggregates over the eligible vacancy set (only vacancies with
// a VERIFIED role node). Powers the public market-snapshot hero (total + last
// sync + source directory) and the feed's seniority/format filter options. See
// md/journal/migrations/market-snapshot.md.

import type { Seniority, WorkFormat } from "../../platform/shared/contract";

export interface AggregateSourceCount {
  id: string;
  code: string;
  displayName: string;
  count: number;
}

export interface VacancyAggregatesResponse {
  /** Count of eligible Positions (MET-138) — never source Postings. */
  total: number;
  /** Grain of `total`/`seniorityDist`/`workFormatDist`. */
  unit: "positions";
  /** ISO-8601. When this aggregate was computed. */
  asOf: string;
  /** No time-bounding is applied to the eligible set yet. */
  window: "all-time";
  /** ISO-8601. max(last_source_activity_at) over the eligible set. Null if empty. */
  lastSyncAt: string | null;
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  /** unit: source_postings — per-source posting volume. A reposted Position
   *  counts once per source here, so never sum this against `total`. */
  sources: AggregateSourceCount[];
}
