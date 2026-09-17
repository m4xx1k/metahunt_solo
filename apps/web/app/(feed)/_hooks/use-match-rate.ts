"use client";

import { useResults } from "@/features/vacancy-filters/use-results";
import type { ListVacanciesQuery } from "@/lib/api/vacancies";

// A trailing 30-day count as a stand-in for "how often will this digest fire" —
// deliberately independent of the on-screen freshness filter, which controls
// what's shown right now, not what a subscription will receive going forward
// (a 7-day vs 30-day freshness toggle can't change how often new postings
// actually appear).
export const RATE_WINDOW_DAYS = 30;

// A CV digest notifies on STRONG+GOOD unless the subscription stores its own
// gate — mirrors DEFAULT_CV_MIN_FIT in the ETL's subscription-matcher. Counting
// without it promises several times what Telegram will actually send.
const DEFAULT_CV_MIN_FIT = "GOOD" as const;

export function useMatchRate(
  criteria: Omit<ListVacanciesQuery, "page" | "pageSize" | "postedWithinDays"> | null,
  /** Set when the digest is ranked against a CV, so it inherits the fit gate. */
  isCv = false,
): number | undefined {
  const { data } = useResults({
    query: {
      ...criteria,
      page: 1,
      pageSize: 1,
      postedWithinDays: RATE_WINDOW_DAYS,
      ...(isCv ? { minFitTier: criteria?.minFitTier ?? DEFAULT_CV_MIN_FIT } : {}),
    },
    enabled: criteria != null,
  });
  return data?.total;
}

// Weekly, not daily — a daily count reads as unimpressively small for most
// filters even when the weekly one is a healthy number. Never surfaces "~0":
// a filter with nothing to show over a month isn't worth quantifying, it's
// just quiet.
export function formatMatchRate(total: number | undefined): string | null {
  if (total == null || total <= 0) return null;
  const perWeek = (total / RATE_WINDOW_DAYS) * 7;
  if (perWeek >= 1) return `~${Math.round(perWeek)}/week`;
  return `~${total} in the last month`;
}
