// Hand-mirrored types for the ETL `/extraction-cost` endpoints.
// Source of truth: apps/etl/src/extraction-cost/extraction-cost.service.ts.
// Per ADR-0005 we duplicate types here until a second consumer justifies
// extracting libs/contracts.

export interface ExtractionCostTotals {
  count: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costUsd: number;
}

export interface ExtractionCostByVersion extends ExtractionCostTotals {
  promptVersion: number | null;
}

export interface ExtractionCostByModel extends ExtractionCostTotals {
  model: string | null;
}

export interface ExtractionCostRecent {
  id: string;
  extractedAt: string;
  promptVersion: number | null;
  model: string | null;
  client: string | null;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  isFailure: boolean;
  costUsd: number | null;
}

export interface ExtractionCostSummary {
  total: ExtractionCostTotals;
  last24h: ExtractionCostTotals;
  byPromptVersion: ExtractionCostByVersion[];
  byModel: ExtractionCostByModel[];
  recent: ExtractionCostRecent[];
}

async function get<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:4567).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`extraction-cost api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const extractionCostApi = {
  summary: () => get<ExtractionCostSummary>("/extraction-cost/summary"),
};
