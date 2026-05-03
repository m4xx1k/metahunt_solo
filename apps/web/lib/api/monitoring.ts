// Response types and fetch helpers for the ETL `/monitoring` API.
// Source of truth: apps/etl/src/monitoring/monitoring.{controller,service}.ts.
// Hand-mirrored per ADR-0005 — when a second integration starts duplicating
// types, that ticket extracts `libs/contracts/`.
//
// All Date columns become ISO 8601 strings on the wire.

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

export interface Stats {
  ingests: {
    total: number;
    last24h: number;
    byStatus: Partial<Record<IngestStatus, number>>;
  };
  records: {
    total: number;
    extracted: number;
    notExtracted: number;
    last24h: number;
  };
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

function buildQs(params?: unknown): string {
  if (!params || typeof params !== "object") return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    if (
      typeof v !== "string" &&
      typeof v !== "number" &&
      typeof v !== "boolean"
    ) {
      continue;
    }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function get<T>(path: string, params?: unknown): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}${buildQs(params)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`monitoring api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const monitoringApi = {
  stats: () => get<Stats>("/monitoring/stats"),
  sources: () => get<Source[]>("/monitoring/sources"),
  listIngests: (q: ListIngestsQuery = {}) =>
    get<Paginated<IngestListItem>>("/monitoring/ingests", q),
  getIngest: (id: string) =>
    get<IngestListItem>(`/monitoring/ingests/${encodeURIComponent(id)}`),
  listRecords: (q: ListRecordsQuery = {}) =>
    get<Paginated<RecordListItem>>("/monitoring/records", q),
  getRecord: (id: string) =>
    get<RecordDetail>(`/monitoring/records/${encodeURIComponent(id)}`),
};
