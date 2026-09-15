import type { AnalyticsPageActiveUsers, AnalyticsPagePeriod } from "@/lib/api/analytics-page";
import { formatCount } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { HintText } from "@/ui/overlay/InfoHint";

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
        hint={
          <HintText label="why DAU's window is fixed" text={windowLabel("dau", period)}>
            Always a 24h window, not the picker — a fixed daily pulse to compare across periods.
          </HintText>
        }
      />
      <StatCard
        label="WAU"
        value={formatCount(activeUsers.wau)}
        hint={
          <HintText label="why WAU's window is fixed" text={windowLabel("wau", period)}>
            Always a 7d window (capped to the picker on 24h) — same reason as DAU.
          </HintText>
        }
      />
      <StatCard
        label="MAU"
        value={formatCount(activeUsers.mau)}
        hint={
          <HintText label="why MAU scales with the picker" text={windowLabel("mau", period)}>
            The one tile that scales with the picker — 90d reads distinctly from 30d here.
          </HintText>
        }
      />
    </StatGrid>
  );
}
