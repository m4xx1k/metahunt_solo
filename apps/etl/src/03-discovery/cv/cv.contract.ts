// reverse-ATS candidate ingestion contract — see
// md/journal/migrations/reverse-ats.md (§3-4).

export interface CandidateNodeRef {
  id: string;
  name: string;
}

// Result of POST /cv.
export interface CvIngestResult {
  candidateId: string;
  reused: boolean; // true → same CV content already ingested, LLM skipped
  role: string | null;
  seniority: string | null;
  matched: CandidateNodeRef[]; // resolved SKILL nodes
  unmatched: string[]; // skills with no taxonomy node (kept as strings)
}

// Read-back for GET /cv/:id (verification).
export interface CandidateView extends CvIngestResult {
  englishLevel: string | null;
  experienceYears: number | null;
  extracted: Record<string, unknown>;
}
