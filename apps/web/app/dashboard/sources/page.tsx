import type { Metadata } from "next";

import { monitoringApi, type IngestStatus } from "@/lib/api/monitoring";
import { taxonomyApi, type SourceCoverage } from "@/lib/api/taxonomy";
import { formatCount } from "@/lib/format";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Panel } from "@/ui/layout/Panel";
import { SourcesTable, type SourceRow } from "./_components/SourcesTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sources" };

const ONE_DAY_MS = 24 * 3600 * 1000;

export default async function SourcesPage() {
  // eslint-disable-next-line react-hooks/purity -- per-request snapshot in a server component
  const since = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const [sources, stats, last24h, coverage] = await Promise.all([
    monitoringApi.sources(),
    monitoringApi.stats(),
    monitoringApi.listIngests({ since, limit: 100 }),
    taxonomyApi.coverage().catch(() => null),
  ]);

  const recent7Pairs = await Promise.all(
    sources.map(async (source) => {
      const list = await monitoringApi.listIngests({ sourceId: source.id, limit: 7 });
      return [source.id, list.items.map((item) => item.status).reverse()] as const;
    }),
  );
  const recent7BySourceId: Record<string, IngestStatus[]> = Object.fromEntries(recent7Pairs);

  const records24hBySourceId = last24h.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.sourceId] = (acc[item.sourceId] ?? 0) + item.recordCount;
    return acc;
  }, {});

  const latestBySourceId = Object.fromEntries(
    stats.latestPerSource.map((item) => [item.sourceId, item]),
  );

  const coverageByCode: Record<string, SourceCoverage> = coverage
    ? Object.fromEntries(coverage.bySource.map((s) => [s.code, s]))
    : {};

  const rows: SourceRow[] = sources.map((source) => ({
    source,
    lastIngest: latestBySourceId[source.id] ?? null,
    recent7: recent7BySourceId[source.id] ?? [],
    records24h: records24hBySourceId[source.id] ?? 0,
    coverage: coverageByCode[source.code] ?? null,
  }));

  const records24h = Object.values(records24hBySourceId).reduce((sum, n) => sum + n, 0);
  const failing = rows.filter((row) => row.lastIngest?.lastStatus === "failed").length;

  return (
    <>
      <PageHeader title="Sources" hint="health and skill coverage per feed" />

      <PageBody>
        <StatGrid cols={3}>
          <StatCard label="sources" value={formatCount(sources.length)} hint="configured feeds" />
          <StatCard
            label="records 24h"
            value={formatCount(records24h)}
            hint="collected across all sources"
          />
          <StatCard
            label="failing"
            value={formatCount(failing)}
            hint={failing > 0 ? "last run failed" : "all sources healthy"}
            tone={failing > 0 ? "danger" : "success"}
            href="/dashboard/runs?tab=failed"
          />
        </StatGrid>

        <Panel title="Feeds" meta={`${rows.length} configured`}>
          <SourcesTable rows={rows} />
        </Panel>
      </PageBody>
    </>
  );
}
