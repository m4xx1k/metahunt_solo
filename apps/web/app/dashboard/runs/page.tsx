import type { Metadata } from "next";

import { monitoringApi } from "@/lib/api/monitoring";
import { nonNegativeIntegerSearchParam } from "@/lib/search-params";
import { formatCount } from "@/lib/format";
import { RunList } from "@/entities/ingest/RunRow";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Panel } from "@/ui/layout/Panel";
import { Pagination } from "@/ui/navigation/Pagination";
import { UrlTabPanel, UrlTabs, UrlTabsList, type UrlTab } from "@/ui/navigation/UrlTabs";
import { FailedRunCard } from "./_components/FailedRunCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Runs" };

const PAGE_SIZE = 25;
const FAILED_LIMIT = 25;

const TABS: UrlTab[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
];

// Ingest runs — the pipeline's activity log. The failure tab is what the
// overview's "failed runs" tile links to.
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = nonNegativeIntegerSearchParam(sp.offset);

  const [stats, runs, failed] = await Promise.all([
    monitoringApi.stats("24h"),
    monitoringApi.listIngests({ limit: PAGE_SIZE, offset }),
    monitoringApi.listIngests({ status: "failed", limit: FAILED_LIMIT }),
  ]);

  return (
    <UrlTabs tabs={TABS}>
      <PageHeader
        title="Runs"
        hint="ingest history across every source"
        tabs={<UrlTabsList label="run views" />}
      />

      <PageBody>
        <StatGrid cols={4}>
          <StatCard label="runs · 24h" value={formatCount(stats.ingests.total)} />
          <StatCard
            label="completed · 24h"
            value={formatCount(stats.ingests.completed)}
            tone="success"
          />
          <StatCard label="running" value={formatCount(stats.ingests.running)} />
          <StatCard
            label="failed · 24h"
            value={formatCount(stats.ingests.failed)}
            tone={stats.ingests.failed > 0 ? "danger" : "default"}
          />
        </StatGrid>

        <UrlTabPanel value="all">
          <Panel
            title="History"
            meta={`${formatCount(runs.total)} runs`}
            bodyClassName="gap-3 p-0 pt-2"
          >
            {runs.items.length === 0 ? (
              <div className="px-5 pb-4">
                <EmptyState title="no runs yet" hint="trigger a collection from the ETL backend." />
              </div>
            ) : (
              <RunList runs={runs.items} />
            )}
            <div className="px-5 pb-4">
              <Pagination
                total={runs.total}
                limit={runs.limit}
                offset={runs.offset}
                basePath="/dashboard/runs"
              />
            </div>
          </Panel>
        </UrlTabPanel>

        <UrlTabPanel value="failed">
          {failed.items.length === 0 ? (
            <EmptyState title="no failures on record" hint="every ingest run finished cleanly." />
          ) : (
            <div className="flex flex-col gap-3">
              {failed.items.map((run) => (
                <FailedRunCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </UrlTabPanel>
      </PageBody>
    </UrlTabs>
  );
}
