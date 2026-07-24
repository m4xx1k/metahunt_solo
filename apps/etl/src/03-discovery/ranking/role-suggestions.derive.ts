import {
  ROLE_SUGGEST_MIN_SCORE,
  ROLE_SUGGEST_MIN_VACANCIES,
  ROLE_SUGGEST_TOP_N,
  type RoleSuggestion,
  type RoleSuggestionsResponse,
} from "./ranking.contract";

// One row per ROLE node from the suggester's SQL aggregation: how many of the
// role's last-window vacancies exist, how many the candidate covers at GOOD+,
// and the mean weighted coverage (the cold-start fallback signal).
export interface RoleAggRow {
  roleId: string;
  slug: string | null;
  name: string;
  goodCount: number;
  totalCount: number;
  avgCoverage: number;
}

// Laplace smoothing: a 3/3 role must not outrank a 120/300 one.
export function roleSuggestScore(good: number, total: number): number {
  return (good + 1) / (total + 4);
}

const byMetric = (metric: (r: RoleAggRow) => number) => (a: RoleAggRow, b: RoleAggRow) =>
  metric(b) - metric(a) || b.totalCount - a.totalCount || a.name.localeCompare(b.name);

// Pick the top-N roles for a candidate. Primary ranking = smoothed GOOD+ share;
// when NO role clears the score floor (cold start: 1-3 skills), fall back to
// mean weighted coverage over the same rows and flag the result `reduced`. The
// CV's declared role (when resolved) is pinned first with its honest score.
//
// The show-floor tests the RAW share: with total>=10 the smoothed score never
// drops below 1/14, so a Laplace floor would be dead code (0-good roles would
// always show and `reduced` could never trigger).
export function deriveRoleSuggestions(
  rows: RoleAggRow[],
  pinnedRoleId: string | null,
): RoleSuggestionsResponse {
  const eligible = rows.filter((r) => r.totalCount >= ROLE_SUGGEST_MIN_VACANCIES);
  const score = (r: RoleAggRow) => roleSuggestScore(r.goodCount, r.totalCount);

  const primary = eligible
    .filter((r) => r.goodCount / r.totalCount >= ROLE_SUGGEST_MIN_SCORE)
    .sort(byMetric(score));
  const reduced = primary.length === 0;
  const ordered = reduced ? [...eligible].sort(byMetric((r) => r.avgCoverage)) : primary;

  const pinned = pinnedRoleId ? eligible.find((r) => r.roleId === pinnedRoleId) : undefined;
  const rest = pinned ? ordered.filter((r) => r.roleId !== pinned.roleId) : ordered;
  const top = (pinned ? [pinned, ...rest] : rest).slice(0, ROLE_SUGGEST_TOP_N);

  const items: RoleSuggestion[] = top.map((r) => ({
    roleId: r.roleId,
    slug: r.slug,
    name: r.name,
    score: score(r),
    goodCount: r.goodCount,
    totalCount: r.totalCount,
  }));
  return { reduced, items };
}
