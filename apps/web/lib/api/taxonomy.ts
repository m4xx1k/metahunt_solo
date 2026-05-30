// Response types and fetch helpers for the ETL `/admin/taxonomy` API.
// Source of truth: apps/etl/src/taxonomy/taxonomy.{controller,service}.ts.
// Hand-mirrored per ADR-0005 — same posture as lib/api/monitoring.ts.

import { apiBase, apiGet, buildQs } from "./client";

export type AxisKey = "role" | "skill" | "domain";

export type NodeType = "ROLE" | "SKILL" | "DOMAIN";

export type NodeStatus = "NEW" | "VERIFIED" | "HIDDEN";

export interface AxisCoverage {
  verified: number;
  new: number;
  missing: number;
  total: number;
}

export interface SkillBucket {
  bucket: "100" | "75-99" | "50-74" | "25-49" | "1-24" | "0";
  vacancies: number;
  avgSkillCount: number;
}

export interface KindCoverage {
  links: number;
  verified: number;
  pct: number;
}

export interface SourceCoverage {
  code: string;
  vacancies: number;
  links: number;
  verified: number;
  pct: number;
}

export interface TaxonomyCoverage {
  byAxis: Record<AxisKey, AxisCoverage>;
  fullyVerified: {
    total: number;
    fullyVerified: number;
  };
  skillBuckets: SkillBucket[];
  byKind: Record<"required" | "optional", KindCoverage>;
  bySource: SourceCoverage[];
}

export interface NodeListFilters {
  type?: NodeType;
  statuses?: NodeStatus[];
  q?: string;
  blocked?: number;
  page?: number;
  pageSize?: number;
}

export interface NodeListItem {
  id: string;
  type: NodeType;
  canonicalName: string;
  status: NodeStatus;
  vacanciesBlocked: number;
  aliasCount: number;
}

export interface NodeListResult {
  items: NodeListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NodeAlias {
  name: string;
  createdAt: string;
}

export interface NodeSampleVacancy {
  id: string;
  title: string;
  sourceCode: string;
}

export interface NodeDetail {
  id: string;
  canonicalName: string;
  type: NodeType;
  status: NodeStatus;
  createdAt: string;
  aliases: NodeAlias[];
  vacancyCount: number;
  sampleVacancies: NodeSampleVacancy[];
}

export interface FuzzyMatch {
  id: string;
  canonicalName: string;
  status: NodeStatus;
  similarity: number;
  wordSimilarity: number;
}

export interface FuzzyMatchResult {
  node: {
    id: string;
    canonicalName: string;
    type: NodeType;
    status: NodeStatus;
  };
  matches: FuzzyMatch[];
  skippedReason?: string;
}

export interface SearchResult {
  type: NodeType;
  query: string;
  matches: FuzzyMatch[];
}

export interface TrimmedNode {
  id: string;
  canonicalName: string;
  type: NodeType;
  status: NodeStatus;
}

// 409 from PATCH /nodes/:id/rename includes a merge suggestion the UI uses
// to route the operator into the merge flow instead of dead-ending them.
export interface RenameConflict {
  status: 409;
  message: string;
  suggestion?: { mergeTargetId: string };
}

// Thrown by mutate() so callers can `instanceof TaxonomyApiError` and
// inspect `.status` / `.body` for typed conflicts instead of parsing
// stringified responses.
export class TaxonomyApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = "TaxonomyApiError";
    this.status = status;
    this.body = body;
  }
}

function get<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  return apiGet<T>(`${path}${buildQs(params)}`);
}

async function mutate<T>(
  method: "PATCH" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${apiBase()}${path}`;
  const init: RequestInit = { method, cache: "no-store" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let parsed: unknown = raw;
    try {
      parsed = raw ? JSON.parse(raw) : raw;
    } catch {
      // keep raw text
    }
    throw new TaxonomyApiError(
      res.status,
      parsed,
      `taxonomy api ${res.status} ${path}`,
    );
  }
  return (await res.json()) as T;
}

function listParams(
  filters: NodeListFilters,
): Record<string, string | number | undefined> {
  return {
    type: filters.type,
    status: filters.statuses?.join(","),
    q: filters.q,
    blocked: filters.blocked,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

export const taxonomyApi = {
  coverage: () => get<TaxonomyCoverage>("/admin/taxonomy/coverage"),
  list: (filters: NodeListFilters = {}) =>
    get<NodeListResult>("/admin/taxonomy/nodes", listParams(filters)),
  node: (id: string) =>
    get<NodeDetail>(`/admin/taxonomy/nodes/${encodeURIComponent(id)}`),
  fuzzyMatches: (id: string) =>
    get<FuzzyMatchResult>(
      `/admin/taxonomy/nodes/${encodeURIComponent(id)}/fuzzy-matches`,
    ),
  searchVerified: (type: NodeType, q: string, limit?: number) =>
    get<SearchResult>("/admin/taxonomy/nodes/search", { type, q, limit }),
  verify: (id: string) =>
    mutate<TrimmedNode>(
      "PATCH",
      `/admin/taxonomy/nodes/${encodeURIComponent(id)}/verify`,
    ),
  hide: (id: string) =>
    mutate<TrimmedNode>(
      "PATCH",
      `/admin/taxonomy/nodes/${encodeURIComponent(id)}/hide`,
    ),
  rename: (id: string, name: string) =>
    mutate<TrimmedNode>(
      "PATCH",
      `/admin/taxonomy/nodes/${encodeURIComponent(id)}/rename`,
      { name },
    ),
  mergeInto: (sourceId: string, targetId: string) =>
    mutate<{ mergedInto: string; source: string; target: string }>(
      "POST",
      `/admin/taxonomy/nodes/${encodeURIComponent(sourceId)}/merge-into/${encodeURIComponent(targetId)}`,
    ),
};
