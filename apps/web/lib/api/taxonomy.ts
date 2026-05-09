// Response types and fetch helpers for the ETL `/admin/taxonomy` API.
// Source of truth: apps/etl/src/taxonomy/taxonomy.{controller,service}.ts.
// Hand-mirrored per ADR-0005 — same posture as lib/api/monitoring.ts.

export type AxisKey = "role" | "skill" | "domain";

export type NodeType = "ROLE" | "SKILL" | "DOMAIN";

export type NodeStatus = "NEW" | "VERIFIED" | "REJECTED";

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

export interface NodeQueueItem {
  id: string;
  type: NodeType;
  canonicalName: string;
  vacanciesBlocked: number;
}

export interface NodeQueue {
  type: NodeType | "ALL";
  items: NodeQueueItem[];
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

function buildQs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function get<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
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
    throw new Error(`taxonomy api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const taxonomyApi = {
  coverage: () => get<TaxonomyCoverage>("/admin/taxonomy/coverage"),
  queue: (type?: NodeType, limit?: number) =>
    get<NodeQueue>("/admin/taxonomy/queue", { type, limit }),
  node: (id: string) =>
    get<NodeDetail>(`/admin/taxonomy/nodes/${encodeURIComponent(id)}`),
  fuzzyMatches: (id: string) =>
    get<FuzzyMatchResult>(
      `/admin/taxonomy/nodes/${encodeURIComponent(id)}/fuzzy-matches`,
    ),
};
