// Response types and fetch helpers for the ETL `/admin/taxonomy` API.
// Source of truth: apps/etl/src/taxonomy/taxonomy.{controller,service}.ts.
// Hand-mirrored per ADR-0005 — same posture as lib/api/monitoring.ts.
//
// P2 ships the `coverage()` slice only. queue/node/fuzzy-matches land in P3.

export type AxisKey = "role" | "skill" | "domain";

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

async function get<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`taxonomy api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const taxonomyApi = {
  coverage: () => get<TaxonomyCoverage>("/admin/taxonomy/coverage"),
};
