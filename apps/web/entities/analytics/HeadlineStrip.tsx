import type { ProductAnalyticsOverview } from "@/lib/api/product-analytics";
import { formatPercent } from "@/lib/format";
import { Metric } from "@/ui/data/Metric";
import { Panel } from "@/ui/layout/Panel";

// The top of the overview, and the only tier-1 type on the page: three numbers
// that between them say whether the product is working. Everything below is
// supporting detail, and the size difference is what says so.
export function HeadlineStrip({
  growth,
  funnel,
  flow,
  period,
}: {
  growth: ProductAnalyticsOverview["growth"];
  funnel: ProductAnalyticsOverview["funnel"];
  flow: ProductAnalyticsOverview["flow"];
  period: string;
}) {
  const landed = funnel[0]?.journeys ?? 0;
  const linked = funnel.at(-1)?.journeys ?? 0;
  const clicks = flow.digestClicks + flow.feedClicks;

  return (
    <Panel bodyClassName="grid gap-6 p-6 sm:grid-cols-3">
      <Metric
        label="linked users"
        value={growth.totalLinked}
        delta={{ value: growth.current - growth.previous, suffix: " vs last week" }}
        note={`${growth.current} new this week`}
      />
      <Metric
        label="landing → linked"
        value={formatPercent(linked, landed)}
        of={`${linked} / ${landed}`}
        note={`acquisition · ${period}`}
      />
      <Metric label="clicks" value={clicks} note={`digest + feed · ${period}`} />
    </Panel>
  );
}
