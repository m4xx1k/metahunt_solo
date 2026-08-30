// Response types and fetcher for the ETL `/admin/coverage` API.
// Source of truth: apps/etl/src/admin/coverage/coverage.contract.ts.
// Hand-mirrored per ADR-0005 — same posture as lib/api/taxonomy.ts.

import { apiPost } from "./client";

export type CoverageVerdict =
  | "found"
  | "found_not_visible"
  | "seen_but_not_loaded"
  | "not_found"
  | "source_not_supported"
  | "url_not_parseable";

export interface CoverageMatch {
  positionId: string;
  postingId: string;
  title: string;
  companyName: string | null;
  sourceCode: string;
  publishedAt: string | null;
  loadedAt: string;
  ingestLagMinutes: number | null;
  postingCount: number;
  sourceCount: number;
  isCanonical: boolean;
  vacancyPath: string;
  legacyExternalIdForm: boolean;
}

export interface CoverageRow {
  input: string;
  verdict: CoverageVerdict;
  detail: string | null;
  sourceCode: string | null;
  externalId: string | null;
  match: CoverageMatch | null;
  recordPath: string | null;
}

export interface SourceHealth {
  sourceCode: string;
  lastIngestStatus: string | null;
  lastIngestFinishedAt: string | null;
  lastIngestError: string | null;
  postingsLast24h: number;
  postingsLast7d: number;
}

export interface CoverageSummary {
  total: number;
  found: number;
  checked: number;
  coveragePct: number | null;
  medianLagMinutes: number | null;
  byVerdict: Record<CoverageVerdict, number>;
}

export interface CoverageLookupResponse {
  rows: CoverageRow[];
  summary: CoverageSummary;
  sourceHealth: SourceHealth[];
  supportedHosts: string[];
}

export const coverageApi = {
  lookup: (input: string) => apiPost<CoverageLookupResponse>("/admin/coverage/lookup", { input }),
};
