// Shared vocabulary of the /match stepper — imported by the orchestrator and
// every step leaf, so it lives beside them instead of inside either.

/** A picked skill. `id` is a facet slug (manual path) or a node UUID (CV path). */
export interface SkillPick {
  id: string;
  name: string;
}

export type MatchStep = "cv" | "skills" | "roles" | "excludes";

export const MATCH_STEPS: { key: MatchStep; label: string }[] = [
  { key: "cv", label: "CV" },
  { key: "skills", label: "Скіли" },
  { key: "roles", label: "Ролі" },
  { key: "excludes", label: "Винятки" },
];

/** Soft target — below this we nudge (never block) to add more skills. */
export const SKILLS_HINT_MIN = 3;
