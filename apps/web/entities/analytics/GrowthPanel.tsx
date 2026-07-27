import type { ProductGrowth } from "@/lib/api/product-analytics";
import { Sparkline } from "@/ui/charts/Sparkline";
import { Metric } from "@/ui/data/Metric";
import { Panel } from "@/ui/layout/Panel";

// The one number the whole product is judged on: chats that finished linking.
// Week-over-week rather than a running total, because a total only ever goes up
// and so can never tell you to change anything.
export function GrowthPanel({ growth }: { growth: ProductGrowth }) {
  const { current, previous, totalLinked, weeks } = growth;
  const series = weeks.map((week) => week.linked);

  return (
    <Panel title="Growth" meta="linked chats" scope="all-time">
      <Metric
        label="new this week"
        value={current}
        delta={{ value: current - previous, suffix: " vs last week" }}
        note={`${totalLinked} linked in total`}
      >
        {series.length > 1 ? (
          <Sparkline
            points={series}
            width={220}
            height={36}
            ariaLabel="newly linked chats per week"
            className="mt-1"
          />
        ) : null}
      </Metric>
    </Panel>
  );
}
