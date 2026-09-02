import type { VacancySkills } from "@/lib/api/vacancies";

// Client-side twin of feed.controller.ts's `buildSkillDiff` (§4): the cold
// card has `MatchOverlay` (a number, no per-skill breakdown), so it derives
// the ✅/❌/➕ counts from the vacancy's own skills + the scored viewer's
// resolved skills (`FeedResponse.viewerSkills`), the same inputs the warm
// lens gets from `MatchResponse.resolved.matched` + `RankedVacancy.diff`.
//   have    — required OR optional skills the viewer has
//   missing — required skills the viewer lacks
//   bonus   — viewer skills this vacancy doesn't ask for at all
export interface SkillDiffCounts {
  have: number;
  missing: number;
  bonus: number;
}

export function countSkillDiff(
  skills: VacancySkills,
  viewerSkillIds: readonly string[],
): SkillDiffCounts {
  const viewer = new Set(viewerSkillIds);
  let have = 0;
  let missing = 0;
  for (const s of skills.required) {
    if (viewer.has(s.id)) have += 1;
    else missing += 1;
  }
  for (const s of skills.optional) {
    if (viewer.has(s.id)) have += 1;
  }
  const asked = new Set([...skills.required, ...skills.optional].map((s) => s.id));
  const bonus = viewerSkillIds.reduce((n, id) => (asked.has(id) ? n : n + 1), 0);
  return { have, missing, bonus };
}
