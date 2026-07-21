import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export const EXTRACTION_STATUSES = ["pending", "failed", "succeeded"] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export function extractionStatus(
  extractedAt: Date | null,
  extractedData: unknown,
): ExtractionStatus {
  if (!extractedAt) return "pending";
  if (typeof extractedData === "object" && extractedData !== null && "_error" in extractedData) {
    return "failed";
  }
  return "succeeded";
}

export function hasExtractionError(extractedData: SQLWrapper): SQL<boolean> {
  return sql<boolean>`coalesce(${extractedData} ? '_error', false)`;
}
