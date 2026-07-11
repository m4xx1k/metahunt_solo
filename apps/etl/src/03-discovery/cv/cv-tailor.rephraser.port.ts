import type { EntitySet } from "./cv-tailor.contract";

// The seam between the deterministic tailor (SELECT/REORDER, always on) and the
// gated LLM rephrase (ADR-0011 §7). Default binding is absent → the service
// keeps bullets verbatim (zero hallucination, zero spend). A BAML implementation
// is bound only when CV_TAILOR_LLM is enabled.
export const TAILOR_REPHRASER = Symbol("TAILOR_REPHRASER");

export interface RephraseInput {
  sourceText: string;
  allowed: EntitySet; // the only facts the rephrase may reference
  emphasis: string[]; // target-vacancy skills worth foregrounding
}

export interface TailorRephraserPort {
  // Reword the bullet for the target role, wording-only. The subset guard still
  // verifies the output independently — this port is never trusted on its own.
  rephrase(input: RephraseInput): Promise<string>;
}
