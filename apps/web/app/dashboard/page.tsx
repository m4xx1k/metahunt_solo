import type { Metadata } from "next";

import { isStatsPeriod, monitoringApi, type StatsPeriod } from "@/lib/api/monitoring";
import { taxonomyApi } from "@/lib/api/taxonomy";
import { dedupApi } from "@/lib/api/dedup";
import { productAnalyticsApi } from "@/lib/api/product-analytics";
import { formatCount, formatTokens, formatUsd } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { ActivationPanel } from "./_components/overview/ActivationPanel";
import { DedupePanel } from "./_components/overview/DedupePanel";
import { EtlFunnelPanel } from "./_components/overview/EtlFunnelPanel";
import { RecentRunsPanel } from "./_components/overview/RecentRunsPanel";
import { SourcesPanel } from "./_components/overview/SourcesPanel";
import { TaxonomyPanel } from "./_components/overview/TaxonomyPanel";

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

// Every tile and panel here is a door: it shows one number and links to the
// screen that explains it. Nothing on this page is the last word.
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const period = isStatsPeriod(sp.period) ? sp.period : "24h";

  const [stats, recent, coverage, dedupMetrics, activation] = await Promise.all([
    monitoringApi.stats(period),
    monitoringApi.listIngests({ limit: 6 }),
    taxonomyApi.coverage().catch(() => null),
    dedupApi
      .list({ pageSize: 1 })
      .then((r) => r.metrics)
      .catch(() => null),
    productAnalyticsApi.overview(period, "production").catch(() => null),
  ]);

  const periodLabel = PERIOD_LABEL[period];
  const failed = stats.ingests.failed;

  return (
    <>
      <PageHeader
        title="Overview"
        hint={`pipeline and product · ${periodLabel}`}
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
        <StatGrid cols={5}>
          <StatCard
            label="gold"
            value={formatCount(stats.funnel.gold)}
            hint="new unique positions"
            tone="accent"
            href="/dashboard/dedupe"
          />
          <StatCard
            label="silver"
            value={formatCount(stats.funnel.silver)}
            hint="structured by llm"
            href="/dashboard/vacancies"
          />
          <StatCard
            label="merged"
            value={formatCount(stats.funnel.duplicatesMerged)}
            hint="joined an existing group"
            href="/dashboard/dedupe"
          />
          <StatCard
            label="llm spend"
            value={formatUsd(stats.llmCost.costUsd)}
            hint={`${formatCount(stats.llmCost.count)} calls · ${formatTokens(stats.llmCost.tokensIn)} tokens in`}
            href="/dashboard/costs"
          />
          <StatCard
            label="failed runs"
            value={formatCount(failed)}
            hint={failed > 0 ? "open the failure log" : "all clean"}
            tone={failed > 0 ? "danger" : "success"}
            href="/dashboard/runs?tab=failed"
          />
        </StatGrid>

        <div className="grid gap-3 lg:grid-cols-2">
          <EtlFunnelPanel funnel={stats.funnel} period={periodLabel} />
          <ActivationPanel funnel={activation?.funnel ?? []} period={periodLabel} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <SourcesPanel items={stats.latestPerSource} />
          <TaxonomyPanel coverage={coverage} />
          <DedupePanel metrics={dedupMetrics} />
        </div>

        <RecentRunsPanel runs={recent.items} />
      </PageBody>
    </>
  );
}
