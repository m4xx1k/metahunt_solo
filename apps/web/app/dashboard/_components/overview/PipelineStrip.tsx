import Link from "next/link";
import type { ReactNode } from "react";

import type { Stats } from "@/lib/api/monitoring";
import { formatCount, formatTokens, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PanelLink } from "@/ui/navigation/PanelLink";

// The ETL still matters, but it is no longer the headline: one period-scoped
// line, with the failure count as the only thing that can shout.
export function PipelineStrip({ stats, period }: { stats: Stats; period: string }) {
  const failed = stats.ingests.failed;
  return (
    <section className="flex flex-col gap-3 border border-border bg-bg-card px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
          pipeline · {period}
        </span>
        <PanelLink href="/dashboard/runs">runs</PanelLink>
      </div>
      <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <Metric
          label="gold"
          value={formatCount(stats.funnel.gold)}
          href="/dashboard/dedupe"
          accent
        />
        <Metric
          label="silver"
          value={formatCount(stats.funnel.silver)}
          href="/dashboard/vacancies"
        />
        <Metric
          label="merged"
          value={formatCount(stats.funnel.duplicatesMerged)}
          href="/dashboard/dedupe"
        />
        <Metric
          label="llm spend"
          value={formatUsd(stats.llmCost.costUsd)}
          hint={`${formatTokens(stats.llmCost.tokensIn)} in`}
          href="/dashboard/costs"
        />
        <Metric
          label="failed runs"
          value={formatCount(failed)}
          href="/dashboard/runs?tab=failed"
          danger={failed > 0}
        />
      </dl>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  href,
  accent,
  danger,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  href: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">{label}</dt>
      <dd>
        <Link
          href={href}
          className={cn(
            "font-display text-xl font-bold tabular-nums transition-colors hover:text-accent",
            danger ? "text-danger" : accent ? "text-accent" : "text-text-primary",
          )}
        >
          {value}
        </Link>
        {hint ? <span className="pl-2 font-mono text-2xs text-text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}
