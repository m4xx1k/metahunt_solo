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

// A seeded demo profile (candidate.type = 'sample') for the reverse-ATS picker.
// The picker ranks it via the same GET /cv/:id/matches path as an uploaded CV.
export interface SampleCandidate {
  candidateId: string;
  label: string;
  hint: string;
}

// A skill the candidate probably already has but didn't list (GET
// /cv/:id/skill-suggestions). `impliedBy` is the held skill that implies it
// (e.g. "TypeScript") — the UI composes the user-facing reason from it.
export interface SkillSuggestion {
  nodeId: string;
  name: string;
  impliedBy: string;
}
