import type { Metadata } from "next";

import { isStatsPeriod, monitoringApi, type StatsPeriod } from "@/lib/api/monitoring";
import { productAnalyticsApi } from "@/lib/api/product-analytics";
import { HeadlineStrip } from "@/entities/analytics/HeadlineStrip";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { ActivationPanel } from "./_components/overview/ActivationPanel";
import { ChannelsPanel } from "./_components/overview/ChannelsPanel";
import { PipelineStrip } from "./_components/overview/PipelineStrip";
import { UsersPanel } from "./_components/overview/UsersPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "week", label: "7d" },
  { value: "all", label: "all" },
];

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  "24h": "last 24h",
  week: "last 7d",
  all: "all time",
};

// Read top to bottom: the headline says whether the product works, channels say
// where the people came from, the roster says who is here, the strip says
// whether the pipeline behind it is healthy. One period drives all of it.
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const period = isStatsPeriod(sp.period) ? sp.period : "24h";

  const [stats, product] = await Promise.all([
    monitoringApi.stats(period),
    productAnalyticsApi.overview(period, "production").catch(() => null),
  ]);

  const periodLabel = PERIOD_LABEL[period];

  return (
    <>
      <PageHeader
        title="Overview"
        hint={`product and pipeline · ${periodLabel}`}
        actions={
          <UrlSegments
            param="period"
            value={period}
            defaultValue="24h"
            options={PERIOD_OPTIONS}
            label="period"
          />
        }
      />

      <PageBody>
        {product ? (
          <>
            {/* Four bands by emphasis: the headline, then where they come from,
                then who is here, then the pipeline that feeds all of it. */}
            <HeadlineStrip
              growth={product.growth}
              funnel={product.funnel}
              flow={product.flow}
              period={periodLabel}
            />

            <div className="grid gap-3 lg:grid-cols-3">
              <ChannelsPanel
                channels={product.channels}
                period={periodLabel}
                className="lg:col-span-2"
              />
              <ActivationPanel funnel={product.funnel} period={periodLabel} />
            </div>

            <UsersPanel subscribers={product.subscriberActivity} period={periodLabel} />
          </>
        ) : (
          <EmptyState
            title="product analytics api unavailable"
            hint="the headline, channel and user widgets need /admin/product-analytics."
            tone="danger"
          />
        )}

        <PipelineStrip stats={stats} period={periodLabel} />
      </PageBody>
    </>
  );
}
