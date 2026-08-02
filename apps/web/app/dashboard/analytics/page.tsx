import type { Metadata } from "next";

import {
  analyticsPageApi,
  isAnalyticsPagePeopleSort,
  isAnalyticsPagePeriod,
  type AnalyticsPagePeriod,
} from "@/lib/api/analytics-page";
import { firstSearchParam, nonNegativeIntegerSearchParam } from "@/lib/search-params";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { FunnelSection } from "./_components/FunnelSection";
import { MetricsTiles } from "./_components/MetricsTiles";
import { PeopleTable } from "./_components/PeopleTable";
import { SourceFilter } from "./_components/SourceFilter";
import { SourcesSection } from "./_components/SourcesSection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

const PEOPLE_PAGE_LIMIT = 50;

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

  const [metrics, people] = await Promise.all([
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
  ]);

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
        {!metrics.available ? (
          <EmptyState
            title="PostHog personal API key not configured"
            hint="Metrics, funnel, and traffic sources need POSTHOG_PERSONAL_API_KEY on the ETL. The people table below still shows Postgres identity — subscriptions, registration, Telegram link — without PostHog activity."
          />
        ) : (
          <>
            <MetricsTiles activeUsers={metrics.activeUsers} period={period} />
            <FunnelSection funnel={metrics.funnel} ctaClicks={metrics.ctaClicks} />
            <SourcesSection sources={metrics.sources} activeSource={source} period={period} />
          </>
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
