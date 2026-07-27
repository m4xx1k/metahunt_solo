// The seam between "talking to an ATS" and "everything downstream". Adapters
// are pure: `boardUrl` says where to look, `toItems` maps a fetched payload.
// Nothing here does IO, so the PoC CLI and a future Temporal activity can each
// drive the same code without either one being a test double for the other.

export const ATS_TYPES = ["ashby", "greenhouse", "lever", "hurma"] as const;
export type AtsType = (typeof ATS_TYPES)[number];

/** Mirrors the `employment_type` pgEnum. */
export type NormalizedEmploymentType =
  "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE" | "INTERNSHIP";

export interface NormalizedSalary {
  min: number | null;
  max: number | null;
  /**
   * ISO 4217 as the board reported it — deliberately a plain string, not the
   * narrow `currency` pgEnum. Boards emit GBP/PLN/CAD and dropping a salary
   * because the enum can't hold its currency is worse than storing the code.
   */
  currency: string | null;
  /** e.g. "1 YEAR", "per-year-salary" — board-specific, normalized downstream. */
  interval: string | null;
  /** Verbatim source, for `vacancies.salary_raw`: re-parse without re-extracting. */
  raw: string;
}

export interface NormalizedItem {
  /** Native board id. Stable across edits — the key for `(source_id, external_id)`. */
  externalId: string;
  title: string;
  descriptionHtml: string;
  /** Public posting URL a candidate can apply through. */
  link: string;
  /** Null when the board exposes no publish date; the caller falls back to first-seen. */
  publishedAt: Date | null;
  /** Raw location strings, placeholders removed. Empty means the board said nothing. */
  locations: string[];
  isRemote: boolean | null;
  employmentType: NormalizedEmploymentType | null;
  /** Feeds the TECH/NONTECH gate in `passesTechGate` — ATS-only signal. */
  department: string | null;
  team: string | null;
  /** Null when the board carries no structured pay. Usually null outside the US. */
  salary: NormalizedSalary | null;
}

export interface AtsAdapter {
  readonly type: AtsType;
  boardUrl(slug: string): string;
  /** Throws on a payload shape the adapter does not recognize — a silent
   *  empty result would look identical to a board with no open roles. */
  toItems(payload: unknown, slug: string): NormalizedItem[];
}

// Boards use these where a real location belongs. Keeping them would make the
// UA-location filter match on noise.
const LOCATION_PLACEHOLDERS = new Set(["all", "any", "n/a", "-", "various", "multiple"]);

export function cleanLocations(raw: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const entry of raw) {
    // Greenhouse packs several into one string: "Europe; Poland; Ukraine".
    for (const part of (entry ?? "").split(/[;|]/)) {
      const value = part.trim();
      if (!value || LOCATION_PLACEHOLDERS.has(value.toLowerCase())) continue;
      seen.add(value);
    }
  }
  return [...seen];
}

const EMPLOYMENT_ALIASES: Record<string, NormalizedEmploymentType> = {
  fulltime: "FULL_TIME",
  "full-time": "FULL_TIME",
  "full time": "FULL_TIME",
  permanent: "FULL_TIME",
  parttime: "PART_TIME",
  "part-time": "PART_TIME",
  "part time": "PART_TIME",
  contract: "CONTRACT",
  contractor: "CONTRACT",
  temporary: "CONTRACT",
  temp: "CONTRACT",
  freelance: "FREELANCE",
  intern: "INTERNSHIP",
  internship: "INTERNSHIP",
  trainee: "INTERNSHIP",
  // Hurma is a Ukrainian ATS and states these in Ukrainian, not English.
  "повна зайнятість": "FULL_TIME",
  "часткова зайнятість": "PART_TIME",
  "проєктна робота": "CONTRACT",
  "проектна робота": "CONTRACT",
  фріланс: "FREELANCE",
  стажування: "INTERNSHIP",
};

export function normalizeEmploymentType(
  raw: string | null | undefined,
): NormalizedEmploymentType | null {
  if (!raw) return null;
  return EMPLOYMENT_ALIASES[raw.trim().toLowerCase()] ?? null;
}

const REMOTE_WORKPLACE = new Set(["remote", "fully remote", "віддалена", "віддалено"]);
const ONSITE_WORKPLACE = new Set(["onsite", "on-site", "office", "hybrid", "офіс", "гібридна"]);

/** Boards disagree on casing and vocabulary; unknown values stay null rather
 *  than defaulting to false, so "we don't know" survives into the data. */
export function normalizeRemote(
  workplaceType: string | null | undefined,
  explicitFlag?: boolean | null,
): boolean | null {
  if (typeof explicitFlag === "boolean") return explicitFlag;
  const value = workplaceType?.trim().toLowerCase();
  if (!value) return null;
  if (REMOTE_WORKPLACE.has(value)) return true;
  if (ONSITE_WORKPLACE.has(value)) return false;
  return null;
}
