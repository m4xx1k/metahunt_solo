export const REPORTING_PERIODS = ["24h", "week", "30d", "all"] as const;
export type ReportingPeriod = (typeof REPORTING_PERIODS)[number];

const PERIOD_DURATION_MS: Record<Exclude<ReportingPeriod, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function reportingPeriodSince(period: ReportingPeriod): Date | null {
  if (period === "all") return null;
  return new Date(Date.now() - PERIOD_DURATION_MS[period]);
}
