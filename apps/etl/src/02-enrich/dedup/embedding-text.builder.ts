import { createHash } from "node:crypto";

import { cleanDescription } from "./sanitize";

/**
 * Builds the canonical text that gets embedded for a vacancy, plus a
 * stable hash so re-embeds only happen when the underlying inputs
 * actually changed.
 *
 * Tier 1 fix (dedup audit 2026-08-27): emit the cleaned description alone.
 * Leading with structured fields (Title/Role/Seniority/Format/Skills) poisoned
 * cross-source cosine distance (recall was 26% vs 86% for description-only).
 * Title is retained as a fallback only when description is empty.
 */
export interface EmbeddingTextInput {
  title: string;
  description: string | null;
}

export interface EmbeddingTextResult {
  text: string;
  hash: string;
}

export function buildEmbeddingText(input: EmbeddingTextInput): EmbeddingTextResult {
  const cleaned = cleanDescription(input.description);
  const text = cleaned.length > 0 ? cleaned : `Title: ${input.title.trim()}`;
  const hash = createHash("sha256").update(text).digest("hex");
  return { text, hash };
}
