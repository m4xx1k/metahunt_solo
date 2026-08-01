import Link from "next/link";

import type { AnalyticsPagePeriod, AnalyticsPageSource } from "@/lib/api/analytics-page";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel } from "@/ui/layout/Panel";

const TOP_N = 10;

function hrefFor(period: AnalyticsPagePeriod, source: string | undefined) {
  const params = new URLSearchParams();
  if (period !== "30d") params.set("period", period);
  if (source) params.set("source", source);
  const qs = params.toString();
  return qs ? `/dashboard/analytics?${qs}` : "/dashboard/analytics";
}

// Plain divs with width percentages, per the no-chart-library rule — each row
// is a Link, so clicking it both filters and clicking the already-active row
// clears the filter again.
export function SourcesSection({
  sources,
  activeSource,
  period,
}: {
  sources: AnalyticsPageSource[];
  activeSource: string | undefined;
  period: AnalyticsPagePeriod;
}) {
  const top = sources.slice(0, TOP_N);
  const max = top[0]?.people ?? 0;

  if (top.length === 0) {
    return (
      <Panel title="Traffic sources" meta="top 10 · by people" scope="period">
        <p className="font-mono text-xs text-text-muted">no pageviews in this period</p>
      </Panel>
    );
  }

  return (
    <Panel title="Traffic sources" meta="top 10 · by people" scope="period">
      <div className="flex flex-col gap-2">
        {top.map((row) => {
          const active = row.source === activeSource;
          const pct = max > 0 ? Math.min(Math.max((row.people / max) * 100, 1.5), 100) : 0;
          return (
            <Link
              key={row.source}
              href={hrefFor(period, active ? undefined : row.source)}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-1.5 border px-3 py-2 transition-colors",
                active ? "border-accent bg-bg-elev" : "border-transparent hover:border-border",
              )}
            >
              <div className="flex items-baseline justify-between gap-4 font-mono text-xs">
                <span
                  className={cn("min-w-0 truncate", active ? "text-accent" : "text-text-secondary")}
                >
                  {row.source}
                </span>
                <span className="shrink-0 tabular-nums text-text-primary">
                  {formatCount(row.people)}
                </span>
              </div>
              <div className="h-1.5 w-full bg-bg-elev" aria-hidden="true">
                <div
                  className={cn("h-full", active ? "bg-accent" : "bg-text-secondary")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
