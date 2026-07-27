import type { ProductRetention } from "@/lib/api/product-analytics";
import { CohortGrid, type CohortRow } from "@/ui/charts/CohortGrid";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";

// Does the curve flatten? That is the only question here. Percentages are shown
// because they are what the shape is read from, but every cell keeps its
// denominator so a two-person cohort cannot pose as a trend.
export function RetentionPanel({ retention }: { retention: ProductRetention }) {
  const rows: CohortRow[] = retention.cohorts.map((cohort) => ({
    label: cohort.weekStart.slice(5),
    size: cohort.size,
    returned: cohort.returned,
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
