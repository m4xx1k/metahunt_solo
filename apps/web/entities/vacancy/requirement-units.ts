import type { RequirementRef } from "@/lib/api/vacancies";

// A requirement unit is one thing a vacancy asks for. Members sharing a
// `group` are alternatives — "Jenkins or GitLab CI" is one requirement, and
// knowing either satisfies it; an ungrouped skill is a unit of one.
//
// Both client-side readings of a vacancy's requirements key off this: the
// skill diff (counts and the "you're missing" list) and the card's own chip
// row. They share it so they cannot disagree with each other, or with the
// coverage the API computed the same way.
//
// Members are sorted by name because a unit's names become one label string
// ("aws / azure / google cloud") and the API does not order its skill rows —
// unsorted, that label would be free to differ between two renders of the
// same vacancy.
export function requirementUnits(required: readonly RequirementRef[]): RequirementRef[][] {
  const units = new Map<string, RequirementRef[]>();
  for (const skill of required) {
    const key = skill.group == null ? `n${skill.id}` : `g${skill.group}`;
    const members = units.get(key);
    if (members) members.push(skill);
    else units.set(key, [skill]);
  }
  for (const members of units.values()) members.sort((a, b) => a.name.localeCompare(b.name));
  return [...units.values()];
}
