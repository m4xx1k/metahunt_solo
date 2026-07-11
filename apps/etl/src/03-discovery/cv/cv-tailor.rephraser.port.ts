// The seam between selection (deterministic, always) and the bold LLM rewrite
// (ADR-0011 §5.3). One batched call rewrites every selected bullet; the subset
// guard then verifies each output independently, so this is never trusted alone.
export const TAILOR_REPHRASER = Symbol("TAILOR_REPHRASER");

export interface RephraseBatchInput {
  bullets: { id: string; text: string }[];
  role: string; // the target role/label, for voice
  emphasis: string[]; // target-vacancy skills worth foregrounding
}

export interface TailorRephraserPort {
  // Reword the bullets for the target role. Output is keyed by the input id;
  // wording-only, facts-locked (the guard enforces it downstream).
  rephraseBatch(input: RephraseBatchInput): Promise<{ id: string; text: string }[]>;
}
