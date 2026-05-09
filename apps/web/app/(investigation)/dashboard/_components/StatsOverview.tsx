import { cn } from "@/lib/utils";
import type { Stats } from "@/lib/api/monitoring";
import { formatCount, formatPercent } from "@/lib/format";

export function StatsOverview({ stats }: { stats: Stats }) {
  const extractedPct = formatPercent(stats.records.extracted, stats.records.total);
  const failed = stats.ingests.byStatus.failed ?? 0;
  const running = stats.ingests.byStatus.running ?? 0;

  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="ingests · total"
        value={formatCount(stats.ingests.total)}
        sub={`${formatCount(stats.ingests.last24h)} in last 24h`}
      />
      <StatCard
        label="ingests · health"
        value={`${formatCount(running + (stats.ingests.byStatus.completed ?? 0))} ok`}
        sub={
          failed > 0
            ? `${formatCount(failed)} failed · ${formatCount(running)} running`
            : `${formatCount(running)} running`
        }
        tone={failed > 0 ? "danger" : "default"}
      />
      <StatCard
        label="records · total"
        value={formatCount(stats.records.total)}
        sub={`+${formatCount(stats.records.last24h)} in last 24h`}
      />
      <StatCard
        label="records · extracted"
        value={extractedPct}
        sub={`${formatCount(stats.records.extracted)} of ${formatCount(stats.records.total)}`}
        tone="accent"
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border border-border bg-bg-card p-6 shadow-[6px_6px_0_0_#000]",
      )}
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span
        className={cn(
          "font-display text-4xl font-bold leading-none",
          tone === "accent" && "text-accent",
          tone === "danger" && "text-danger",
          tone === "default" && "text-text-primary",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-xs text-text-secondary">{sub}</span>
    </div>
  );
}
