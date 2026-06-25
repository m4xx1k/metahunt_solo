import { apiBase, apiGet, buildQs } from "./client";
import type {
  FitTier,
  MatchResponse,
  RecommendResponse,
  SkillRef,
} from "./ranking";

// CV ingestion + stored-candidate matching — mirrors apps/etl .../cv/.

export interface CvIngestResult {
  candidateId: string;
  reused: boolean;
  role: string | null;
  seniority: string | null;
  matched: Pick<SkillRef, "id" | "name">[];
  unmatched: string[];
}

// Multi-value filters travel as CSV (e.g. "MIDDLE,SENIOR") to keep the GET URL
// flat; booleans/enums as-is (buildQs stringifies them).
export interface CvMatchQuery {
  seniorities?: string;
  workFormats?: string;
  englishLevels?: string;
  employmentTypes?: string;
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
  minFitTier?: FitTier;
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

  recommendations: (id: string) =>
    apiGet<RecommendResponse>(`/cv/${id}/recommendations`),
};
