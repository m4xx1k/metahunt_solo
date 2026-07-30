interface MatchDraftSkill {
  id: string;
}

export function buildMatchHref(
  candidateId: string | null,
  manualSkills: MatchDraftSkill[],
  roleIds: Set<string>,
  excludedSkills: MatchDraftSkill[],
): string {
  const params = new URLSearchParams();
  if (candidateId) params.set("cv", candidateId);
  if (!candidateId && manualSkills.length > 0) {
    params.set("skills", manualSkills.map((skill) => skill.id).join(","));
  }
  if (candidateId || roleIds.size > 0) params.set("roles", [...roleIds].join(","));
  if (excludedSkills.length > 0) {
    params.set("excludeSkills", excludedSkills.map((skill) => skill.id).join(","));
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
