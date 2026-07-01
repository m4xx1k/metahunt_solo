import { FIT_TIER_VALUES } from "@/lib/api/ranking";
import {
  EMPLOYMENT_TYPE_VALUES,
  ENGLISH_LEVEL_VALUES,
  WORK_FORMAT_VALUES,
} from "@/lib/api/vacancies";
import type { OptionRow } from "./types";

// Curated enum option sets for the closed-enum filter sections (DB value → label).
// Distinct from the feed's aggregate-sourced seniority/format options (those carry
// live counts); these are the static, candidate-facing label maps.

// Freshness window used by the `fresh` filter → postedWithinDays.
export const FRESH_DAYS = 7;

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
