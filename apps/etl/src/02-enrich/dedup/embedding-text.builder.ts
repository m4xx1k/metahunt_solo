import { createHash } from "node:crypto";

import { cleanDescription } from "./sanitize";

/**
 * Builds the canonical text that gets embedded for a vacancy, plus a
 * stable hash so re-embeds only happen when the underlying inputs
 * actually changed.
 *
 * Design call: we lead with the post-LLM structured fields (title,
 * role, seniority, format, skills) and trail with the cleaned
 * description. Structured fields are noise-free and high-signal
 * (same job → same role name), while the description provides the
 * long-tail context that disambiguates two postings with identical
 * structured fields.
 */

export interface EmbeddingTextInput {
  title: string;
  roleName: string | null;
  seniority: string | null;
  workFormat: string | null;
  requiredSkills: string[];
  description: string | null;
}

export interface EmbeddingTextResult {
  text: string;
  hash: string;
}

export function buildEmbeddingText(
  input: EmbeddingTextInput,
): EmbeddingTextResult {
  const parts: string[] = [];

  parts.push(`Title: ${input.title.trim()}`);
  if (input.roleName) parts.push(`Role: ${input.roleName.trim()}`);
  if (input.seniority) parts.push(`Seniority: ${input.seniority}`);
  if (input.workFormat) parts.push(`Format: ${input.workFormat}`);
  if (input.requiredSkills.length > 0) {
    // Sort + lowercase so two postings listing the same skills in
    // different order produce identical embedding text — otherwise
    // ordering jitter alone would shift the vector.
    const skills = Array.from(
      new Set(input.requiredSkills.map((s) => s.trim().toLowerCase())),
    ).sort();
    parts.push(`Skills: ${skills.join(", ")}`);
  }

  const cleaned = cleanDescription(input.description);
  if (cleaned.length > 0) {
    parts.push(`Description: ${cleaned}`);
  }

  const text = parts.join("\n");
  const hash = createHash("sha256").update(text).digest("hex");
  return { text, hash };
}
