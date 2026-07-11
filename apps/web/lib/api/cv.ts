import { apiBase, apiDelete, apiGet, apiPost, buildQs } from "./client";
import type { FitTier, MatchResponse, RecommendResponse, SkillRef } from "./ranking";

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

// A skill implied by one the candidate already listed (e.g. TypeScript ->
// JavaScript) but didn't state outright.
export interface SkillSuggestion {
  nodeId: string;
  name: string;
  impliedBy: string;
}

export const cvApi = {
  // Seeded demo profiles for the picker. ISR-cached — the sample set is static
  // (changes only on a re-seed / deploy).
  samples: () => apiGet<SampleCandidate[]>("/cv/samples", { next: { revalidate: 300 } }),

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

  // Read-back for a stored candidate (role/seniority + current skill set) —
  // powers the account-side skill manager.
  get: (id: string) => apiGet<CvIngestResult>(`/cv/${id}`),

  matches: (id: string, query: CvMatchQuery = {}) =>
    apiGet<MatchResponse>(`/cv/${id}/matches${buildQs(query)}`),

  recommendations: (id: string) => apiGet<RecommendResponse>(`/cv/${id}/recommendations`),

  skillSuggestions: (id: string) => apiGet<SkillSuggestion[]>(`/cv/${id}/skill-suggestions`),

  // Confirms a suggested (or manually-searched) skill onto the candidate's
  // profile; returns the updated full skill set.
  confirmSkill: (id: string, nodeId: string) =>
    apiPost<Pick<SkillRef, "id" | "name">[]>(`/cv/${id}/skills`, { nodeId }),

  // Removes a skill link; returns the remaining skill set.
  removeSkill: (id: string, nodeId: string) =>
    apiDelete<Pick<SkillRef, "id" | "name">[]>(`/cv/${id}/skills/${nodeId}`),

  // Dismisses a suggestion so it never resurfaces for this candidate.
  rejectSkill: (id: string, nodeId: string) =>
    apiPost<{ ok: true }>(`/cv/${id}/skills/reject`, { nodeId }),
};
