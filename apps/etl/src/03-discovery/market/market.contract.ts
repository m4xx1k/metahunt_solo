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
  total: number;
  /** ISO-8601. max(loaded_at) over the eligible set. Null if empty. */
  lastSyncAt: string | null;
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  sources: AggregateSourceCount[];
}
