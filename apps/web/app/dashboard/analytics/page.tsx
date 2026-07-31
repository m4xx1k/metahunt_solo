import type { Metadata } from "next";

import {
  isProductAnalyticsPeriod,
  isProductAnalyticsPopulation,
  productAnalyticsApi,
  type CrmPeopleSort,
  type ProductAnalyticsPeriod,
  type ProductAnalyticsPopulation,
} from "@/lib/api/product-analytics";
import { firstSearchParam } from "@/lib/search-params";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { UrlTabPanel, UrlTabs, UrlTabsList, type UrlTab } from "@/ui/navigation/UrlTabs";
import { DeliveryPanel } from "./_components/DeliveryPanel";
import { EventsPanel } from "./_components/EventsPanel";
import { FunnelPanel } from "./_components/FunnelPanel";
import { IdentityPanel } from "./_components/IdentityPanel";
import { JourneysPanel } from "./_components/JourneysPanel";
import { SubscribersPanel } from "./_components/SubscribersPanel";
import { PeoplePanel } from "./_components/PeoplePanel";

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

// Three tabs, in the order the questions get asked: what to do now, what the
// events mean, and the plumbing you only open when a number looks wrong.
const TABS: UrlTab[] = [
  { value: "now", label: "Now" },
  { value: "events", label: "Events" },
  { value: "debug", label: "Debug" },
];

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

  const rawOffset = Number(firstSearchParam(sp.offset));
  const offset = Number.isSafeInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const rawSort = firstSearchParam(sp.sort);
  const sort: CrmPeopleSort =
    rawSort === "first_known" || rawSort === "clicks" || rawSort === "at_risk" ? rawSort : "recent";
  const q = firstSearchParam(sp.q);
  const from = firstSearchParam(sp.from);
  const to = firstSearchParam(sp.to);
  const [data, people] = await Promise.all([
    productAnalyticsApi.overview(period, population),
    productAnalyticsApi.people({ period, q, sort, offset, from, to }),
  ]);

  return (
    <UrlTabs tabs={TABS}>
      <PageHeader
        title="Analytics"
        hint="CRM facts · behaviour and acquisition live in PostHog"
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
        <UrlTabPanel value="now">
          <PeoplePanel people={people} period={period} q={q} sort={sort} from={from} to={to} />
        </UrlTabPanel>

        <UrlTabPanel value="events">
          <EventsPanel />
        </UrlTabPanel>

        <UrlTabPanel value="debug">
          <FunnelPanel
            funnel={data.funnel}
            funnelBypass={data.funnelBypass}
            feedEngagement={data.feedEngagement}
            population={population}
          />
          <SubscribersPanel subscribers={data.subscriberActivity} />
          <DeliveryPanel
            delivery={data.delivery}
            digestClicks={data.flow.digestClicks}
            population={population}
          />
          <IdentityPanel subscriptions={data.subscriptions} identity={data.identity} />
          <JourneysPanel journeys={data.recentJourneys} generatedAt={data.generatedAt} />
        </UrlTabPanel>
      </PageBody>
    </UrlTabs>
  );
}
