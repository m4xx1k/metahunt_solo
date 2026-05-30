// Response types and fetch helpers for the ETL `/monitoring` API.
// Source of truth: apps/etl/src/monitoring/monitoring.{controller,service}.ts.
// Hand-mirrored per ADR-0005 — when a second integration starts duplicating
// types, that ticket extracts `libs/contracts/`.
//
// All Date columns become ISO 8601 strings on the wire.

import { apiGet, buildQs } from "./client";

export type IngestStatus = "running" | "completed" | "failed";

export interface Source {
  id: string;
  code: string;
  displayName: string;
  baseUrl: string;
  rssUrl: string | null;
}

export interface IngestListItem {
  id: string;
  sourceId: string;
  sourceCode: string | null;
  sourceDisplayName: string | null;
  status: IngestStatus;
  triggeredBy: string;
  workflowRunId: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  payloadStorageKey: string | null;
  errorMessage: string | null;
  recordCount: number;
  extractedCount: number;
}

export interface RecordListItem {
  id: string;
  sourceId: string;
  sourceCode: string | null;
  sourceDisplayName: string | null;
  rssIngestId: string;
  externalId: string | null;
  hash: string;
  title: string;
  description: string | null;
  link: string | null;
  category: string | null;
  publishedAt: string;
  createdAt: string;
  extractedAt: string | null;
  extractedData: unknown;
  extracted: boolean;
}

// list and detail endpoints now return identical shapes; kept as alias for
// callsite clarity (detail = single fetch by id).
export type RecordDetail = RecordListItem;

export interface LatestPerSourceItem {
  sourceId: string;
  sourceCode: string | null;
  sourceDisplayName: string | null;
  lastIngestId: string;
  lastIngestAt: string;
  lastFinishedAt: string | null;
  lastStatus: IngestStatus;
}

export type StatsPeriod = "24h" | "week" | "all";

export interface StatsFunnel {
  bronze: number;
  silver: number;
  gold: number;
  duplicatesMerged: number;
}

export interface StatsLlmCost {
  count: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface Stats {
  period: StatsPeriod;
  funnel: StatsFunnel;
  ingests: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  llmCost: StatsLlmCost;
  latestPerSource: LatestPerSourceItem[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListIngestsQuery {
  sourceId?: string;
  status?: IngestStatus;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface ListRecordsQuery {
  ingestId?: string;
  sourceId?: string;
  extracted?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export const monitoringApi = {
  stats: (period: StatsPeriod = "24h") =>
    apiGet<Stats>(`/monitoring/stats${buildQs({ period })}`),
  sources: () => apiGet<Source[]>("/monitoring/sources"),
  listIngests: (q: ListIngestsQuery = {}) =>
    apiGet<Paginated<IngestListItem>>(`/monitoring/ingests${buildQs(q)}`),
  getIngest: (id: string) =>
    apiGet<IngestListItem>(`/monitoring/ingests/${encodeURIComponent(id)}`),
  listRecords: (q: ListRecordsQuery = {}) =>
    apiGet<Paginated<RecordListItem>>(`/monitoring/records${buildQs(q)}`),
  getRecord: (id: string) =>
    apiGet<RecordDetail>(`/monitoring/records/${encodeURIComponent(id)}`),
};
