import type { OptionRow } from "@/components/data/filters/types";
import { FIT_TIER_VALUES, type FitTier } from "@/lib/api/ranking";
import {
  EMPLOYMENT_TYPE_VALUES,
  ENGLISH_LEVEL_VALUES,
  WORK_FORMAT_VALUES,
  type EmploymentType,
  type EnglishLevel,
  type Seniority,
  type WorkFormat,
} from "@/lib/api/vacancies";

// Local filter state for the reverse-ATS page (not URL-backed). Multi-select
// arrays are OR-within / AND-across the groups; the rest are simple toggles.
export interface Filters {
  seniorities: Seniority[];
  workFormats: WorkFormat[];
  englishLevels: EnglishLevel[];
  employmentTypes: EmploymentType[];
  minFitTier: FitTier | null; // hide vacancies below this coverage tier
  noTest: boolean; // → hasTestAssignment: false (also keeps unknowns)
  reservation: boolean; // → hasReservation: true ("бронь")
  fresh: boolean; // → postedWithinDays = FRESH_DAYS
}

export const FRESH_DAYS = 7;

export const NO_FILTERS: Filters = {
  seniorities: [],
  workFormats: [],
  englishLevels: [],
  employmentTypes: [],
  minFitTier: null,
  noTest: false,
  reservation: false,
  fresh: false,
};

export const hasActiveFilters = (f: Filters): boolean =>
  f.seniorities.length > 0 ||
  f.workFormats.length > 0 ||
  f.englishLevels.length > 0 ||
  f.employmentTypes.length > 0 ||
  f.minFitTier !== null ||
  f.noTest ||
  f.reservation ||
  f.fresh;

export const activeFilterCount = (f: Filters): number =>
  f.seniorities.length +
  f.workFormats.length +
  f.englishLevels.length +
  f.employmentTypes.length +
  (f.minFitTier !== null ? 1 : 0) +
  (f.noTest ? 1 : 0) +
  (f.reservation ? 1 : 0) +
  (f.fresh ? 1 : 0);

// Add/remove a value from a multi-select array (immutable).
export function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

// ── option sets for the filter sections (DB enum → user-facing label) ──
const opt = (id: string, label: string): OptionRow => ({ id, label, count: 0 });

// Seniority: drop the noisy tail (INTERN/PRINCIPAL/C_LEVEL) for a candidate UI.
export const SENIORITY_OPTIONS: OptionRow[] = (
  ["JUNIOR", "MIDDLE", "SENIOR", "LEAD"] as const
).map((s) => opt(s, s.toLowerCase()));

export const WORK_FORMAT_OPTIONS: OptionRow[] = WORK_FORMAT_VALUES.map((v) =>
  opt(v, { REMOTE: "remote", OFFICE: "офіс", HYBRID: "гібрид" }[v]),
);

// CEFR labels users recognise, mapped from the DB english enum.
export const ENGLISH_OPTIONS: OptionRow[] = ENGLISH_LEVEL_VALUES.map((v) =>
  opt(
    v,
    {
      BEGINNER: "A1–A2",
      INTERMEDIATE: "B1",
      UPPER_INTERMEDIATE: "B2",
      ADVANCED: "C1",
      NATIVE: "C2",
    }[v],
  ),
);

export const EMPLOYMENT_OPTIONS: OptionRow[] = EMPLOYMENT_TYPE_VALUES.map((v) =>
  opt(
    v,
    {
      FULL_TIME: "full-time",
      PART_TIME: "part-time",
      CONTRACT: "contract",
      FREELANCE: "freelance",
      INTERNSHIP: "intern",
    }[v],
  ),
);

export const FIT_OPTIONS: OptionRow[] = FIT_TIER_VALUES.map((v) =>
  opt(v, v.toLowerCase()),
);
