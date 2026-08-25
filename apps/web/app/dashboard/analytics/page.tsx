import type { Metadata } from "next";

import {
  analyticsPageApi,
  isAnalyticsPagePeopleSort,
  isAnalyticsPagePeriod,
  type AnalyticsPagePeriod,
} from "@/lib/api/analytics-page";
import { productAnalyticsApi, type ProductAnalyticsPeriod } from "@/lib/api/product-analytics";
import { firstSearchParam, nonNegativeIntegerSearchParam } from "@/lib/search-params";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { DeliveryPanel } from "./_components/DeliveryPanel";
import { FunnelSection } from "./_components/FunnelSection";
import { LifecyclePanel } from "./_components/LifecyclePanel";
import { MetricsTiles } from "./_components/MetricsTiles";
import { PeopleTable } from "./_components/PeopleTable";
import { RosterPanel } from "./_components/RosterPanel";
import { SourceFilter } from "./_components/SourceFilter";
import { SourcesSection } from "./_components/SourcesSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

const PEOPLE_PAGE_LIMIT = 50;

const POSTHOG_STATUS_COPY = {
  unconfigured: {
    title: "PostHog v2 is not configured",
    hint: "Metrics and Contacts activity need POSTHOG_PERSONAL_API_KEY, POSTHOG_PRIVATE_HOST, and the selected v2 project ID on the ETL.",
  },
  denied: {
    title: "PostHog access denied",
    hint: "The query key was rejected (401/403). Verify its scope and that it belongs to the configured v2 project.",
  },
  unavailable: {
    title: "PostHog is temporarily unavailable",
    hint: "The query timed out, failed, or returned an unexpected response. Product data remains available; retry after service recovery.",
  },
  empty: {
    title: "No behavioural activity in this period",
    hint: "PostHog answered successfully, but there are no qualifying human events. This is not a connectivity failure.",
  },
  ready: { title: "", hint: "" },
} as const;

// The roster, lifecycle and delivery endpoint speaks the console's older period
// vocabulary; this page's picker is the PostHog one. Map, don't widen either.
const PRODUCT_PERIOD: Record<AnalyticsPagePeriod, ProductAnalyticsPeriod> = {
  "24h": "24h",
  "7d": "week",
  "30d": "30d",
  "90d": "all",
};

const PERIOD_OPTIONS: Array<{ value: AnalyticsPagePeriod; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawPeriod = firstSearchParam(sp.period);
  const period: AnalyticsPagePeriod =
    rawPeriod && isAnalyticsPagePeriod(rawPeriod) ? rawPeriod : "30d";
  const source = firstSearchParam(sp.source) || undefined;
  const q = firstSearchParam(sp.q) || undefined;
  const rawSort = firstSearchParam(sp.sort);
  const sort = rawSort && isAnalyticsPagePeopleSort(rawSort) ? rawSort : undefined;
  const dir: "asc" | "desc" = firstSearchParam(sp.dir) === "desc" ? "desc" : "asc";
  const offset = nonNegativeIntegerSearchParam(sp.offset, 0);

  const [metrics, people, product] = await Promise.all([
    analyticsPageApi.metrics({ period, source }),
    analyticsPageApi.people({
      period,
      source,
      q,
      sort,
      dir: sort ? dir : undefined,
      offset,
      limit: PEOPLE_PAGE_LIMIT,
    }),
    productAnalyticsApi.overview(PRODUCT_PERIOD[period]).catch(() => null),
  ]);
  const periodLabel = period === "24h" ? "last 24h" : `last ${period}`;

  return (
    <>
      <PageHeader
        title="Analytics"
        hint="live PostHog + Postgres, per render · no ledger reads"
        actions={
          <>
            <UrlSegments
              param="period"
              value={period}
              defaultValue="30d"
              options={PERIOD_OPTIONS}
              label="period"
            />
            <SourceFilter sources={metrics.sources} value={source} />
          </>
        }
      />

      <PageBody>
        {!metrics.available || metrics.behaviorStatus === "empty" ? (
          <EmptyState
            title={POSTHOG_STATUS_COPY[metrics.behaviorStatus].title}
            hint={`${POSTHOG_STATUS_COPY[metrics.behaviorStatus].hint} The Contacts table below still shows Postgres identity and subscription facts.`}
          />
        ) : (
          <>
            <MetricsTiles activeUsers={metrics.activeUsers} period={period} />
            <FunnelSection funnel={metrics.funnel} ctaClicks={metrics.ctaClicks} />
            <SourcesSection sources={metrics.sources} activeSource={source} period={period} />
          </>
        )}

        {product ? (
          <>
            <LifecyclePanel states={product.subscriberStates} />
            <RosterPanel subscribers={product.subscriberActivity} period={periodLabel} />
            <DeliveryPanel delivery={product.delivery} period={periodLabel} />
          </>
        ) : (
          <EmptyState
            title="product analytics api unavailable"
            hint="the roster, lifecycle and delivery panels need /admin/product-analytics."
            tone="danger"
          />
        )}

        <PeopleTable
          people={people}
          available={metrics.available}
          period={period}
          source={source}
          q={q}
          sort={sort}
          dir={dir}
          offset={offset}
          limit={PEOPLE_PAGE_LIMIT}
        />
      </PageBody>
    </>
  );
}
