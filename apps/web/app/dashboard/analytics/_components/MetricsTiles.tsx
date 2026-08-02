import type { AnalyticsPageActiveUsers, AnalyticsPagePeriod } from "@/lib/api/analytics-page";
import { formatCount } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";

// MAU scales to the selected period; DAU and WAU keep their natural windows.
const NATURAL_WINDOW_DAYS = { dau: 1, wau: 7 } as const;

const PERIOD_DAYS: Record<AnalyticsPagePeriod, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function windowLabel(metric: "dau" | "wau" | "mau", period: AnalyticsPagePeriod): string {
  const periodDays = PERIOD_DAYS[period];
  const days = metric === "mau" ? periodDays : Math.min(NATURAL_WINDOW_DAYS[metric], periodDays);
  return days === 1 ? "last 24h" : `last ${days}d`;
}

export function MetricsTiles({
  activeUsers,
  period,
}: {
  activeUsers: AnalyticsPageActiveUsers;
  period: AnalyticsPagePeriod;
}) {
  return (
    <StatGrid cols={3}>
      <StatCard
        label="DAU"
        value={formatCount(activeUsers.dau)}
        hint={windowLabel("dau", period)}
      />
      <StatCard
        label="WAU"
        value={formatCount(activeUsers.wau)}
        hint={windowLabel("wau", period)}
      />
      <StatCard
        label="MAU"
        value={formatCount(activeUsers.mau)}
        hint={windowLabel("mau", period)}
      />
    </StatGrid>
  );
}
