import { createHash } from "node:crypto";

import { cleanDescription } from "./sanitize";

/** The one canonical text representation used for extraction and exact dedup. */
export function normalizedVacancyContent(
  title: string,
  description: string | null | undefined,
): string {
  return `Title: ${title.trim()}\n\n${cleanDescription(description)}`;
}

export function contentFingerprint(title: string, description: string | null | undefined): string {
  return sha256(normalizedVacancyContent(title, description));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
