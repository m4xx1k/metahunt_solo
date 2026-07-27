import type { ProductRetention } from "@/lib/api/product-analytics";
import { CohortGrid, type CohortRow } from "@/ui/charts/CohortGrid";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";

// Does the curve flatten? That is the only question here. Percentages are shown
// because they are what the shape is read from, but every cell keeps its
// denominator so a two-person cohort cannot pose as a trend.
const WEEK_MS = 7 * 86_400_000;

// The server always returns a full window, so a cohort linked this week would
// otherwise render five future weeks as a flat 0% — a drop-off that has not had
// the chance to happen yet. Truncate to the weeks that actually elapsed.
function elapsedWeeks(weekStart: string): number {
  const started = new Date(`${weekStart}T00:00:00Z`).getTime();
  return Math.max(Math.floor((Date.now() - started) / WEEK_MS) + 1, 1);
}

export function RetentionPanel({ retention }: { retention: ProductRetention }) {
  const rows: CohortRow[] = retention.cohorts.map((cohort) => ({
    label: cohort.weekStart.slice(5),
    size: cohort.size,
    returned: cohort.returned.slice(0, elapsedWeeks(cohort.weekStart)),
  }));

  if (rows.length === 0) {
    return (
      <Panel title="Retention" meta="weeks since linking" scope="all-time">
        <EmptyState title="nobody linked yet" hint="cohorts start at the first link." />
      </Panel>
    );
  }

  return (
    <Panel
      title="Retention"
      meta="weeks since linking"
      scope="all-time"
      footer={
        <span className="text-text-muted">
          a dotted cell means the cohort is too small to read as a rate.
        </span>
      }
    >
      <CohortGrid
        rows={rows}
        columns={retention.windowWeeks}
        ariaLabel="share of each weekly cohort that acted again, by week since linking"
      />
    </Panel>
  );
}
