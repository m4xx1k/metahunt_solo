import type { VacancyUpsertValues } from "../repositories/vacancy.repository";

// What the board itself stated, as written by the ATS ingest into
// `rss_records.ats_fields`. Mirrors NormalizedItem in
// apps/etl/src/01-ingest/ats/ats.contract.ts.
export interface AtsStructuredFields {
  locations?: string[] | null;
  isRemote?: boolean | null;
  employmentType?: VacancyUpsertValues["employmentType"] | null;
  salary?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    interval?: string | null;
    raw?: string | null;
  } | null;
}

const SUPPORTED_CURRENCIES = new Set(["USD", "EUR", "UAH", "GBP", "PLN", "CAD", "INR", "COP"]);

function toCurrency(code: string | null | undefined): VacancyUpsertValues["currency"] | null {
  const upper = code?.trim().toUpperCase();
  return upper && SUPPORTED_CURRENCIES.has(upper)
    ? (upper as NonNullable<VacancyUpsertValues["currency"]>)
    : null;
}

/**
 * An employer filling in a salary field and an LLM reading a number out of
 * prose are different claims. Where the board stated a fact, it wins; the LLM
 * only fills the gaps. Nothing here ever downgrades an ATS value.
 */
export function applyAtsPrecedence(
  values: VacancyUpsertValues,
  ats: AtsStructuredFields | null | undefined,
): VacancyUpsertValues {
  const merged: VacancyUpsertValues = { ...values };

  // Provenance is set even with no ATS input, so a null salary_source always
  // means "nobody supplied a salary" rather than "we forgot to record it".
  merged.salarySource = values.salaryMin != null || values.salaryMax != null ? "LLM_TEXT" : null;

  if (!ats) return merged;

  if (ats.locations?.length) merged.locations = ats.locations;
  if (ats.employmentType) merged.employmentType = ats.employmentType;
  // Only a positive remote flag overrides: `false` distinguishes neither
  // OFFICE nor HYBRID, and the LLM read the description to tell them apart.
  if (ats.isRemote === true) merged.workFormat = "REMOTE";

  const hasAtsSalary = ats.salary && (ats.salary.min != null || ats.salary.max != null);
  if (hasAtsSalary) {
    merged.salaryMin = ats.salary?.min != null ? Math.round(ats.salary.min) : null;
    merged.salaryMax = ats.salary?.max != null ? Math.round(ats.salary.max) : null;
    // An unrepresentable currency nulls the enum but keeps the numbers and the
    // raw string, so a later enum widening can recover it without re-extracting.
    merged.currency = toCurrency(ats.salary?.currency);
    merged.salarySource = "ATS_STRUCTURED";
    merged.salaryRaw = ats.salary?.raw ?? null;
  }

  return merged;
}
