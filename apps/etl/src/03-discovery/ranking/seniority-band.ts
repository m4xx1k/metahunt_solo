import { SENIORITY_VALUES, type Seniority } from "../../platform/shared/contract";

// Cohort band: the candidate's level ±1 on the ladder. NULL-seniority vacancies
// are always folded in by the SQL, so this returns only concrete levels. An
// unknown or missing candidate level widens to the whole ladder.
export function cohortSeniorities(level: string | null): Seniority[] {
  const i = level ? SENIORITY_VALUES.findIndex((s) => s === level) : -1;
  if (i === -1) return [...SENIORITY_VALUES];
  return SENIORITY_VALUES.slice(Math.max(0, i - 1), i + 2);
}
