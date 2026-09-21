import type { NodeRef, RequirementRef, VacancySkills } from "@/lib/api/vacancies";

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
  /** Unmet requirements, one entry each — a choice renders as a single
   *  "AWS / Azure / GCP" chip, not one red chip per alternative. */
  missing: NodeRef[];
  /** Viewer skills this vacancy doesn't ask for at all. */
  bonus: NodeRef[];
  /** Requirements, not links: "AWS or Azure" counts once, so this matches the
   *  denominator the Fit percentage beside it was computed from. */
  requiredTotal: number;
}

export function skillDiff(skills: VacancySkills, viewerSkills: readonly NodeRef[]): SkillDiff {
  const viewerIds = new Set(viewerSkills.map((s) => s.id));
  const have: NodeRef[] = [];
  // Members sharing a `group` are alternatives: any one of them satisfies the
  // requirement, so they count, and render, as one.
  const units = new Map<string, RequirementRef[]>();
  for (const skill of skills.required) {
    if (viewerIds.has(skill.id)) have.push(skill);
    const key = skill.group === undefined ? `n${skill.id}` : `g${skill.group}`;
    const members = units.get(key);
    if (members) members.push(skill);
    else units.set(key, [skill]);
  }
  const missing: NodeRef[] = [];
  for (const members of units.values()) {
    if (members.some((m) => viewerIds.has(m.id))) continue;
    missing.push({ id: members[0].id, name: members.map((m) => m.name).join(" / ") });
  }
  for (const skill of skills.optional) {
    if (viewerIds.has(skill.id)) have.push(skill);
  }
  const vacancyIds = new Set([...skills.required, ...skills.optional].map((s) => s.id));
  const bonus = viewerSkills.filter((s) => !vacancyIds.has(s.id));
  return { have, missing, bonus, requiredTotal: units.size };
}
