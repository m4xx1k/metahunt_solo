import type { RecommendItem } from "./ranking.contract";

export function recCoveragePct(covered: number, cohortSize: number): number {
  if (cohortSize <= 0) return 0;
  return Math.round((covered / cohortSize) * 100);
}

// Flag the rarer-than-average skills (higher IDF) as max-leverage. Every input
// already clears the cohort df-floor, so this just isolates the standouts.
export function markLeverage(
  items: Omit<RecommendItem, "leverage">[],
): RecommendItem[] {
  if (items.length === 0) return [];
  const mean = items.reduce((sum, i) => sum + i.idf, 0) / items.length;
  return items.map((i) => ({ ...i, leverage: i.idf >= mean }));
}
