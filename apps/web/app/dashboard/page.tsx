import type { Metadata } from "next";

import { isStatsPeriod, monitoringApi, type StatsPeriod } from "@/lib/api/monitoring";
import { productAnalyticsApi } from "@/lib/api/product-analytics";
import { formatCount, formatPercent } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
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

// Product first, pipeline second — and one period drives every number on the
// page: both fetches take it, and each widget only shows period-scoped flow.
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
  const flow = product?.flow ?? {
    joined: 0,
    activated: 0,
    digestClicks: 0,
    feedClicks: 0,
    churned: 0,
  };

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
          <UsersPanel subscribers={product.subscriberActivity} period={periodLabel} />
        ) : (
          <EmptyState
            title="product analytics api unavailable"
            hint="the users, activation and channel widgets need /admin/product-analytics."
            tone="danger"
          />
        )}

        <StatGrid cols={5}>
          <StatCard
            label="joined"
            value={formatCount(flow.joined)}
            hint="new subscriptions"
            href="/dashboard/analytics?tab=subscribers"
          />
          <StatCard
            label="activated"
            value={formatCount(flow.activated)}
            hint="linked telegram"
            tone="accent"
            href="/dashboard/analytics"
          />
          <StatCard
            label="digest clicks"
            value={formatCount(flow.digestClicks)}
            hint="taps from telegram"
            href="/dashboard/analytics?tab=subscribers"
          />
          <StatCard
            label="feed clicks"
            value={formatCount(flow.feedClicks)}
            hint="taps in the web feed"
            href="/dashboard/analytics?tab=funnel"
          />
          <StatCard
            label="churned"
            value={formatCount(flow.churned)}
            hint={
              flow.churned > 0
                ? `${formatPercent(flow.churned, flow.joined)} of joins`
                : "no unsubscribes"
            }
            tone={flow.churned > 0 ? "danger" : "success"}
            href="/dashboard/analytics?tab=subscribers"
          />
        </StatGrid>

        <div className="grid gap-3 lg:grid-cols-2">
          <ActivationPanel funnel={product?.funnel ?? []} period={periodLabel} />
          <ChannelsPanel channels={product?.channels ?? []} period={periodLabel} />
        </div>

        <PipelineStrip stats={stats} period={periodLabel} />
      </PageBody>
    </>
  );
}
