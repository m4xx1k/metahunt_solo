// Hand-mirrored shape of ExtractedVacancy from BAML.
// Source of truth: apps/etl/baml_src/extract-vacancy.baml.
// Per ADR-0005 we duplicate types here until a second consumer justifies
// extracting libs/contracts.

export type Seniority =
  | "INTERN"
  | "JUNIOR"
  | "MIDDLE"
  | "SENIOR"
  | "LEAD"
  | "PRINCIPAL"
  | "C_LEVEL";

export type WorkFormat = "REMOTE" | "OFFICE" | "HYBRID";

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "FREELANCE"
  | "INTERNSHIP";

export type EnglishLevel =
  | "BEGINNER"
  | "INTERMEDIATE"
  | "UPPER_INTERMEDIATE"
  | "ADVANCED"
  | "NATIVE";

export type Currency = "USD" | "EUR" | "UAH";

export type EngagementType =
  | "PRODUCT"
  | "OUTSOURCE"
  | "OUTSTAFF"
  | "STARTUP"
  | "AGENCY";

export interface ExtractedLocation {
  city: string;
  country: string;
}

export interface ExtractedSkills {
  required: string[];
  optional: string[];
}

export interface ExtractedSalary {
  min: number | null;
  max: number | null;
  currency: Currency | null;
}

export interface ExtractedVacancy {
  role: string | null;
  seniority: Seniority | null;
  skills: ExtractedSkills;
  experienceYears: number | null;
  salary: ExtractedSalary | null;
  englishLevel: EnglishLevel | null;
  employmentType: EmploymentType | null;
  workFormat: WorkFormat | null;
  locations: ExtractedLocation[];
  domain: string | null;
  engagementType: EngagementType | null;
  companyName: string | null;
  hasTestAssignment: boolean | null;
  hasReservation: boolean | null;
}

// Backend either stores a BAML-validated ExtractedVacancy or null. Anything
// else is treated as absent.
export function safeExtracted(data: unknown): ExtractedVacancy | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as ExtractedVacancy;
}

export const SENIORITY_LABELS: Record<Seniority, string> = {
  INTERN: "intern",
  JUNIOR: "junior",
  MIDDLE: "middle",
  SENIOR: "senior",
  LEAD: "lead",
  PRINCIPAL: "principal",
  C_LEVEL: "c-level",
};

export const WORK_FORMAT_LABELS: Record<WorkFormat, string> = {
  REMOTE: "remote",
  OFFICE: "office",
  HYBRID: "hybrid",
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "full-time",
  PART_TIME: "part-time",
  CONTRACT: "contract",
  FREELANCE: "freelance",
  INTERNSHIP: "internship",
};

export const ENGLISH_LABELS: Record<EnglishLevel, string> = {
  BEGINNER: "A1–A2",
  INTERMEDIATE: "B1",
  UPPER_INTERMEDIATE: "B2",
  ADVANCED: "C1–C2",
  NATIVE: "native",
};

export const ENGAGEMENT_LABELS: Record<EngagementType, string> = {
  PRODUCT: "product",
  OUTSOURCE: "outsource",
  OUTSTAFF: "outstaff",
  STARTUP: "startup",
  AGENCY: "agency",
};

const TITLE_FALLBACK_MAX = 90;

export function displayTitle(input: {
  title: string;
  extractedData: unknown;
}): string {
  const ex = safeExtracted(input.extractedData);
  if (ex?.role) {
    const sen = ex.seniority ? SENIORITY_LABELS[ex.seniority].toUpperCase() : null;
    return sen ? `${sen} · ${ex.role}` : ex.role;
  }
  return input.title.length <= TITLE_FALLBACK_MAX
    ? input.title
    : `${input.title.slice(0, TITLE_FALLBACK_MAX)}…`;
}

export function formatSalary(salary: ExtractedSalary | null): string | null {
  if (!salary) return null;
  const { min, max, currency } = salary;
  if (min == null && max == null) return null;
  const sign =
    currency === "USD"
      ? "$"
      : currency === "EUR"
        ? "€"
        : currency === "UAH"
          ? "₴"
          : "";
  const fmt = (n: number) =>
    n >= 1000
      ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
      : String(n);
  if (min != null && max != null && min !== max) {
    return `${sign}${fmt(min)}–${fmt(max)}`;
  }
  const v = max ?? min;
  if (v == null) return null;
  return `${sign}${fmt(v)}`;
}

export function formatLocations(
  locations: ExtractedLocation[] | undefined,
): string | null {
  if (!locations || locations.length === 0) return null;
  return locations
    .map((l) => l.city)
    .filter((c): c is string => Boolean(c))
    .join(" · ");
}

export function formatExperience(years: number | null): string | null {
  if (years == null) return null;
  if (years === 0) return "no experience required";
  return `${years}+ years`;
}
