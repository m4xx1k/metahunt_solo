// Cross-cutting wire primitives shared across the read-API modules (feed,
// tracks, market). No NestJS/Drizzle/runtime imports so the web client can
// mirror these types directly.

// ───────────────────────────── Enums ─────────────────────────────
// Mirror the pgEnums in libs/database/src/schema/vacancies.ts. Value arrays
// are the single runtime source of truth so controllers can validate query
// params at the boundary without redeclaring the set.

export const SENIORITY_VALUES = [
  "INTERN",
  "JUNIOR",
  "MIDDLE",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
  "C_LEVEL",
] as const;
export type Seniority = (typeof SENIORITY_VALUES)[number];

export const WORK_FORMAT_VALUES = ["REMOTE", "OFFICE", "HYBRID"] as const;
export type WorkFormat = (typeof WORK_FORMAT_VALUES)[number];

export const EMPLOYMENT_TYPE_VALUES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "FREELANCE",
  "INTERNSHIP",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPE_VALUES)[number];

export const ENGLISH_LEVEL_VALUES = [
  "BEGINNER",
  "INTERMEDIATE",
  "UPPER_INTERMEDIATE",
  "ADVANCED",
  "NATIVE",
] as const;
export type EnglishLevel = (typeof ENGLISH_LEVEL_VALUES)[number];

export type Currency = "USD" | "EUR" | "UAH";

export type EngagementType =
  | "PRODUCT"
  | "OUTSOURCE"
  | "OUTSTAFF"
  | "STARTUP"
  | "AGENCY";

// ───────────────────────── Resolved refs ─────────────────────────
// Server resolves FKs to {id, name}-shaped refs so the UI never has to do a
// second round-trip just to render a label.

export interface NodeRef {
  id: string;
  /** `nodes.canonical_name` — already humanized at ingest time. */
  name: string;
}
