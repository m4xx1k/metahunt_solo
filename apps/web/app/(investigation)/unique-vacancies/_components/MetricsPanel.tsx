import { Card } from "@/ui";
import type { DedupMetrics } from "@/lib/api/dedup";

// Three plain numbers that tell the whole story: how many postings went in,
// how many distinct positions came out, how many of those span two platforms.
export function MetricsPanel({ metrics }: { metrics: DedupMetrics }) {
  return (
    <Card>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Stat
          label="проаналізовано вакансій"
          value={metrics.totalVacancies.toString()}
        />
        <Stat
          label="унікальних позицій"
          value={metrics.totalGroups.toString()}
        />
        <Stat
          label="дублікатів між джерелами"
          value={metrics.crossSourceGroups.toString()}
          highlight
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div
        className={
          highlight
            ? "font-display text-3xl font-bold text-accent md:text-4xl"
            : "font-display text-3xl font-bold text-text-primary md:text-4xl"
        }
      >
        {value}
      </div>
    </div>
  );
}
