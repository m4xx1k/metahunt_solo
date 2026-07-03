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

// A seeded demo profile for the reverse-ATS picker — ranked via the same
// candidateId path as an uploaded CV.
export interface SampleCandidate {
  candidateId: string;
  label: string;
  hint: string;
}

// Multi-value filters travel as CSV (e.g. "MIDDLE,SENIOR") to keep the GET URL
// flat; booleans/enums as-is (buildQs stringifies them).
export interface CvMatchQuery {
  seniorities?: string;
  workFormats?: string;
  englishLevels?: string;
  employmentTypes?: string;
  /** CSV of DOMAIN node slugs (resolved -> ids server-side). */
  domainIds?: string;
  /** CSV of experience tokens ("0".."5" exact, "6+" = ≥6). */
  experienceYears?: string;
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
  minFitTier?: FitTier;
  postedWithinDays?: number;
  sourceId?: string;
  pageSize?: number;
  page?: number;
}

export const cvApi = {
  // Seeded demo profiles for the picker. ISR-cached — the sample set is static
  // (changes only on a re-seed / deploy).
  samples: () =>
    apiGet<SampleCandidate[]>("/cv/samples", { next: { revalidate: 300 } }),

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
