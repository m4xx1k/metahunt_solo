import type { Metadata } from "next";

import { isStatsPeriod, monitoringApi, type StatsPeriod } from "@/lib/api/monitoring";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { PanelLink } from "@/ui/navigation/PanelLink";
import { UrlSegments } from "@/ui/navigation/UrlSegments";
import { PipelineStrip } from "./_components/overview/PipelineStrip";

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

// The pipeline that feeds the product. Everything about the people it feeds —
// the roster, lifecycle states and delivery — lives on Analytics, which reads
// PostHog and the domain tables rather than a second copy of the same facts.
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const period = isStatsPeriod(sp.period) ? sp.period : "24h";

  const stats = await monitoringApi.stats(period);

  const periodLabel = PERIOD_LABEL[period];

  return (
    <>
      <PageHeader
        title="Overview"
        hint={`ingest pipeline · ${periodLabel}`}
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
        <PipelineStrip stats={stats} period={periodLabel} />
        <PanelLink href="/dashboard/analytics">subscribers, lifecycle and delivery</PanelLink>
      </PageBody>
    </>
  );
}
