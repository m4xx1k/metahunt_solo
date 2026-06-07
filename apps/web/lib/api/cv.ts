import { apiBase, apiGet, buildQs } from "./client";
import type { MatchResponse, SkillRef } from "./ranking";
import type { WorkFormat } from "./vacancies";

// CV ingestion + stored-candidate matching — mirrors apps/etl .../cv/.

export interface CvIngestResult {
  candidateId: string;
  reused: boolean;
  role: string | null;
  seniority: string | null;
  matched: Pick<SkillRef, "id" | "name">[];
  unmatched: string[];
}

export interface CvMatchQuery {
  seniorities?: string; // CSV (e.g. "MIDDLE,SENIOR") — flat GET param
  workFormat?: WorkFormat;
  postedWithinDays?: number;
  sourceId?: string;
  pageSize?: number;
  page?: number;
}

export const cvApi = {
  // Multipart upload (PDF/.txt) — not via apiPost, which is JSON-only.
  uploadFile: async (file: File): Promise<CvIngestResult> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${apiBase()}/cv`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`api ${res.status} /cv: ${body}`);
    }
    return (await res.json()) as CvIngestResult;
  },

  matches: (id: string, query: CvMatchQuery = {}) =>
    apiGet<MatchResponse>(`/cv/${id}/matches${buildQs(query)}`),
};
