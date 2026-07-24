import type { DedupMetrics } from "@/lib/api/dedup";
import { formatCount, formatPercent } from "@/lib/format";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { MeterRow } from "@/ui/data/MeterRow";
import { StatRows } from "@/ui/data/StatRows";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

// Bucket bounds mirror apps/etl/src/dedup/dedup.service.ts::getMetrics().
const BUCKETS: Array<{
  key: "soft" | "hard" | "veryHard";
  label: string;
  note: string;
  tone: "danger" | "neutral" | "accent";
}> = [
  { key: "soft", label: "0.85 – 0.92", note: "manual review", tone: "danger" },
  { key: "hard", label: "0.92 – 0.95", note: "auto-merged", tone: "neutral" },
  { key: "veryHard", label: "≥ 0.95", note: "gold tier", tone: "accent" },
];

export function DedupePanel({ metrics }: { metrics: DedupMetrics | null }) {
  if (!metrics) {
    return (
      <Panel title="Dedupe">
        <EmptyState title="metrics unavailable" tone="danger" />
      </Panel>
    );
  }

  const buckets = metrics.similarityBuckets;
  const max = Math.max(buckets.soft, buckets.hard, buckets.veryHard, 1);

  return (
    <Panel title="Dedupe" meta="cosine similarity">
      <div className="flex flex-col gap-4">
        {BUCKETS.map((bucket) => (
          <MeterRow
            key={bucket.key}
            label={bucket.label}
            value={formatCount(buckets[bucket.key])}
            pct={(buckets[bucket.key] / max) * 100}
            note={bucket.note}
            tone={bucket.tone}
          />
        ))}
      </div>
      <StatRows
        rows={[
          { label: "groups", value: formatCount(metrics.totalGroups) },
          {
            label: "cross-source",
            value: `${formatCount(metrics.crossSourceGroups)} · ${formatPercent(metrics.crossSourceGroups, metrics.totalGroups)}`,
          },
          { label: "avg group size", value: metrics.avgGroupSize.toFixed(2) },
        ]}
      />
      <div className="mt-auto pt-1">
        <PanelLink href="/dashboard/dedupe">groups</PanelLink>
      </div>
    </Panel>
  );
}
