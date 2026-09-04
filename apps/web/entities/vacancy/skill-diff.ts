import type { NodeRef, VacancySkills } from "@/lib/api/vacancies";

// The one ✅ have / ❌ missing / ➕ bonus skill diff, shared by every surface
// that shows one: the vacancy detail page's FitPanel (full lists — it prints
// skill names) and every list card (VacancyMatchCard/DiffCounts — just the
// lengths). Both inputs already ride on the wire: a vacancy's own
// `skills.required`/`.optional`, and the viewer's resolved skills
// (`FeedResponse.viewerSkills` on a list, `VacancyDetailDto.viewerSkills` on
// the detail page) — so this is the client-side twin of what
// feed.controller.ts used to build server-side, MET-144 R4.
export interface SkillDiff {
  /** Required OR optional skills the viewer has. */
  have: NodeRef[];
  /** Required skills the viewer lacks. */
  missing: NodeRef[];
  /** Viewer skills this vacancy doesn't ask for at all. */
  bonus: NodeRef[];
}

export function skillDiff(skills: VacancySkills, viewerSkills: readonly NodeRef[]): SkillDiff {
  const viewerIds = new Set(viewerSkills.map((s) => s.id));
  const have: NodeRef[] = [];
  const missing: NodeRef[] = [];
  for (const skill of skills.required) {
    (viewerIds.has(skill.id) ? have : missing).push(skill);
  }
  for (const skill of skills.optional) {
    if (viewerIds.has(skill.id)) have.push(skill);
  }
  const vacancyIds = new Set([...skills.required, ...skills.optional].map((s) => s.id));
  const bonus = viewerSkills.filter((s) => !vacancyIds.has(s.id));
  return { have, missing, bonus };
}
