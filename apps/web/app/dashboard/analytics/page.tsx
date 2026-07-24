import type { Metadata } from "next";

import {
  isProductAnalyticsPeriod,
  isProductAnalyticsPopulation,
  productAnalyticsApi,
  type ProductAnalyticsPeriod,
  type ProductAnalyticsPopulation,
} from "@/lib/api/product-analytics";
import { firstSearchParam } from "@/lib/search-params";
import { formatCount, formatPercent } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { UrlTabPanel, UrlTabs, UrlTabsList, type UrlTab } from "@/ui/navigation/UrlTabs";
import { FunnelPanel } from "./_components/FunnelPanel";
import { IdentityPanel } from "./_components/IdentityPanel";
import { JourneysPanel } from "./_components/JourneysPanel";
import { SubscribersPanel } from "./_components/SubscribersPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

const PERIOD_OPTIONS: Array<{ value: ProductAnalyticsPeriod; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "week", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "all" },
];

const POPULATION_OPTIONS: Array<{ value: ProductAnalyticsPopulation; label: string }> = [
  { value: "production", label: "prod" },
  { value: "test", label: "test" },
  { value: "all", label: "all" },
];

const TABS: UrlTab[] = [
  { value: "funnel", label: "Funnel" },
  { value: "subscribers", label: "Subscribers" },
  { value: "identity", label: "Identity" },
  { value: "journeys", label: "Journeys" },
];

// browser → api → telegram → digest, from the first-party event ledger.
// Period and population live in the URL (server refetch); the tab lives in the
// URL too, but switches client-side since every panel is already rendered.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawPeriod = firstSearchParam(sp.period);
  const rawPopulation = firstSearchParam(sp.population);
  const period: ProductAnalyticsPeriod =
    rawPeriod && isProductAnalyticsPeriod(rawPeriod) ? rawPeriod : "week";
  const population: ProductAnalyticsPopulation =
    rawPopulation && isProductAnalyticsPopulation(rawPopulation) ? rawPopulation : "production";

  const data = await productAnalyticsApi.overview(period, population);
  const entry = data.funnel[0]?.journeys ?? 0;
  const exit = data.funnel.at(-1)?.journeys ?? 0;

  return (
    <UrlTabs tabs={TABS}>
      <PageHeader
        title="Analytics"
        hint="first-party journey ledger · no telegram ids stored"
        actions={
          <>
            <UrlSegments
              param="population"
              value={population}
              defaultValue="production"
              options={POPULATION_OPTIONS}
              label="population"
            />
            <UrlSegments
              param="period"
              value={period}
              defaultValue="week"
              options={PERIOD_OPTIONS}
              label="period"
            />
          </>
        }
        tabs={<UrlTabsList label="analytics sections" />}
      />

      <PageBody>
        <StatGrid cols={4}>
          <StatCard
            label="new subs"
            value={formatCount(data.subscriptions.createdInPeriod)}
            hint="created in period"
          />
          <StatCard label="active" value={formatCount(data.subscriptions.active)} hint="live now" />
          <StatCard
            label="delivered"
            value={formatCount(data.subscriptions.delivered)}
            hint="got at least one digest"
          />
          <StatCard
            label="landing → click"
            value={formatPercent(exit, entry)}
            hint="end-to-end conversion"
            tone="accent"
          />
        </StatGrid>

        <UrlTabPanel value="funnel">
          <FunnelPanel
            funnel={data.funnel}
            feedEngagement={data.feedEngagement}
            population={population}
          />
        </UrlTabPanel>

        <UrlTabPanel value="subscribers">
          <SubscribersPanel subscribers={data.subscriberActivity} />
        </UrlTabPanel>

        <UrlTabPanel value="identity">
          <IdentityPanel subscriptions={data.subscriptions} identity={data.identity} />
        </UrlTabPanel>

        <UrlTabPanel value="journeys">
          <JourneysPanel journeys={data.recentJourneys} generatedAt={data.generatedAt} />
        </UrlTabPanel>
      </PageBody>
    </UrlTabs>
  );
}
