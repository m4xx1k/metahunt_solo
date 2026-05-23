import type { StatsFunnel } from "@/lib/api/monitoring";
import { formatCount, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  funnel: StatsFunnel;
};

// Bronze → Silver → Gold visualization tied to the medallion data model.
// Bars are scaled to the largest of the three counts so the relative loss
// at each stage is visible (RSS items skipped at parse, duplicates merged).
export function FunnelWidget({ funnel }: Props) {
  const { bronze, silver, gold, duplicatesMerged } = funnel;
  const max = Math.max(bronze, silver, gold, 1);
  const parsePct = formatPercent(silver, bronze);
  const goldPct = formatPercent(gold, silver);
  const dupPct = formatPercent(duplicatesMerged, silver);

  return (
    <div className="border border-border bg-bg-card p-6 shadow-[6px_6px_0_0_#000]">
      <div className="mb-5 flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold text-text-primary">
          ETL-воронка · Bronze → Silver → Gold
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          конверсія між шарами даних
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Stage
          tone="bronze"
          tag="Bronze · сирі RSS"
          count={bronze}
          max={max}
          subline="оголошення з RSS-фідів"
        />
        <Stage
          tone="silver"
          tag="Silver · структуровані"
          count={silver}
          max={max}
          subline={`парсинг LLM · ${parsePct} від Bronze`}
        />
        <Stage
          tone="gold"
          tag="Gold · Golden Records"
          count={gold}
          max={max}
          subline={`нових унікальних позицій · ${goldPct} від Silver`}
        />
      </div>

      <div className="mt-5 border-t border-border pt-4 font-mono text-xs text-text-secondary">
        <span className="text-text-muted">дублікатів злито за період · </span>
        <span className="text-text-primary">{formatCount(duplicatesMerged)}</span>
        <span className="text-text-muted"> ({dupPct} від Silver)</span>
      </div>
    </div>
  );
}

function Stage({
  tone,
  tag,
  count,
  max,
  subline,
}: {
  tone: "bronze" | "silver" | "gold";
  tag: string;
  count: number;
  max: number;
  subline: string;
}) {
  const widthPct = max > 0 ? Math.max((count / max) * 100, 2) : 2;
  const bar = {
    bronze: "bg-text-muted",
    silver: "bg-text-secondary",
    gold: "bg-accent",
  }[tone];
  const num = {
    bronze: "text-text-primary",
    silver: "text-text-primary",
    gold: "text-accent",
  }[tone];

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {tag}
      </span>
      <span
        className={cn("font-display text-3xl font-bold leading-none", num)}
      >
        {formatCount(count)}
      </span>
      <div
        className="h-2 w-full border border-border bg-bg"
        aria-hidden="true"
      >
        <div className={cn("h-full", bar)} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="font-mono text-[10px] text-text-muted">{subline}</span>
    </div>
  );
}
