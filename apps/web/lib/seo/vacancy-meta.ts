// Google truncates the SERP title near 60 characters, and the root template
// appends " · metahunt" — so a page title has ~50 to work with. Composing it by
// hand overran that on long roles ("senior embedded software engineer — …").

import { capitalize } from "@/lib/format";

/** 60 minus " · metahunt". */
export const VACANCY_TITLE_BUDGET = 49;

type TitleParts = {
  role: string;
  /** Seniority label as SENIORITY_LABELS stores it (lowercase), when stated. */
  seniority?: string | null;
  /** The most specific distinguishing fact available: company, else city, else source. */
  qualifier?: string | null;
};

/**
 * Role alone is not distinctive — company is missing on ~44% of vacancies and
 * there are 2,463 "Backend Developer" rows, so thousands of pages would share one
 * title. Add specificity while it fits, and drop it rather than overrun.
 */
export function vacancyTitle({ role, seniority, qualifier }: TitleParts): string {
  // SENIORITY_LABELS is lowercase because the on-page badge is; a SERP title
  // that opens with "middle Backend Developer" just reads like a typo.
  const base = seniority ? `${capitalize(seniority)} ${role}` : role;
  if (base.length >= VACANCY_TITLE_BUDGET) return truncate(base, VACANCY_TITLE_BUDGET);

  const withQualifier = qualifier ? `${base} — ${qualifier}` : base;
  if (withQualifier.length <= VACANCY_TITLE_BUDGET) return withQualifier;

  // The qualifier is what gets sacrificed: the role is the part someone scans for.
  return truncate(withQualifier, VACANCY_TITLE_BUDGET);
}

/** Cuts on a word boundary where possible so the title doesn't end mid-word. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s—-]+$/, "");
}
