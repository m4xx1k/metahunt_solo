import type { StatsFunnel } from "@/lib/api/monitoring";
import { formatCount, formatPercent } from "@/lib/format";
import { MeterRow } from "@/ui/data/MeterRow";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

// Bronze → Silver → Gold, scaled to the widest stage so the drop at each hop
// is the thing you see first.
export function EtlFunnelPanel({ funnel, period }: { funnel: StatsFunnel; period: string }) {
  const { bronze, silver, gold, duplicatesMerged } = funnel;
  const max = Math.max(bronze, silver, gold, 1);

  return (
    <Panel title="Pipeline" meta={period}>
      <div className="flex flex-col gap-4">
        <MeterRow
          label="bronze · raw rss"
          value={formatCount(bronze)}
          pct={(bronze / max) * 100}
          tone="neutral"
        />
        <MeterRow
          label="silver · structured"
          value={formatCount(silver)}
          pct={(silver / max) * 100}
          note={`${formatPercent(silver, bronze)} of bronze`}
          tone="neutral"
        />
        <MeterRow
          label="gold · unique positions"
          value={formatCount(gold)}
          pct={(gold / max) * 100}
          note={`${formatPercent(gold, silver)} of silver · ${formatCount(duplicatesMerged)} merged`}
        />
      </div>
      <div className="mt-auto pt-2">
        <PanelLink href="/dashboard/runs">runs</PanelLink>
      </div>
    </Panel>
  );
}
