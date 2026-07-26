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
import { DeliveryPanel } from "./_components/DeliveryPanel";
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
  { value: "delivery", label: "Delivery" },
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
        {/* `joined` and the conversion follow the period; the three lifecycle
            states are all-time per chat — a state can't be period-scoped, and
            counting `unsubscribed` events here double-counted every /stop. */}
        <StatGrid cols={5}>
          <StatCard label="joined" value={formatCount(data.flow.joined)} hint="new subscriptions" />
          <StatCard
            label="active"
            value={formatCount(data.subscriberStates.active)}
            hint="subscribed chats, alive"
          />
          <StatCard
            label="dormant"
            value={formatCount(data.subscriberStates.dormant)}
            hint="digests land, no reaction 14d"
            tone={data.subscriberStates.dormant > 0 ? "danger" : "default"}
          />
          <StatCard
            label="churned"
            value={formatCount(data.subscriberStates.churned)}
            hint="unsubscribed everything or blocked"
            tone={data.subscriberStates.churned > 0 ? "danger" : "default"}
          />
          <StatCard
            label="landing → linked"
            value={formatPercent(exit, entry)}
            hint="acquisition conversion"
            tone="accent"
          />
        </StatGrid>

        <UrlTabPanel value="funnel">
          <FunnelPanel
            funnel={data.funnel}
            funnelBypass={data.funnelBypass}
            feedEngagement={data.feedEngagement}
            population={population}
          />
        </UrlTabPanel>

        <UrlTabPanel value="subscribers">
          <SubscribersPanel subscribers={data.subscriberActivity} />
        </UrlTabPanel>

        <UrlTabPanel value="delivery">
          <DeliveryPanel
            delivery={data.delivery}
            digestClicks={data.flow.digestClicks}
            population={population}
          />
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
