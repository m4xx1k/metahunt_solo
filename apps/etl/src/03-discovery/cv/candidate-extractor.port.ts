import type { ExtractedCandidate } from "../../baml_client";

// The LLM seam (mirrors VACANCY_EXTRACTOR) — lets tests inject a stub extractor
// instead of calling the real model.
export const CANDIDATE_EXTRACTOR = Symbol("CANDIDATE_EXTRACTOR");

export interface CandidateExtractorPort {
  extract(text: string): Promise<ExtractedCandidate>;
}

export type { ExtractedCandidate };
