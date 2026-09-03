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
  // A real CV is never a URL param (MET-144 step 7 — the onboarding upload
  // already made it the JWT's active CV, same as the feed's own CV switcher).
  // `open=cv` is a one-shot, id-free signal FeedLensShell reads once to land
  // the completed flow in the warm lens instead of a second click.
  if (candidateId) params.set("open", "cv");
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
