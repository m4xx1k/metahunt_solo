import { createHash } from "node:crypto";

import { cleanDescription } from "./sanitize";

/** The one canonical text representation used as extractor input. */
export function normalizedVacancyContent(
  title: string,
  description: string | null | undefined,
): string {
  return `Title: ${title.trim()}\n\n${cleanDescription(description)}`;
}

export function contentFingerprint(title: string, description: string | null | undefined): string {
  // Cross-source copies commonly wrap or translate the title while preserving
  // the actual vacancy body byte-for-byte.  Title is valuable to extraction,
  // but making it part of an "exact content" identity caused those copies to
  // split before the semantic deduper could see them.  A missing body falls
  // back to title so title-only feeds retain a stable identity.
  const body = cleanDescription(description);
  return sha256(body.length > 0 ? body : title.trim().toLowerCase());
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
