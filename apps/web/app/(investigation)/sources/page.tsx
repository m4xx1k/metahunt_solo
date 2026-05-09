import { monitoringApi, type IngestStatus } from "@/lib/api/monitoring";
import { taxonomyApi, type SourceCoverage } from "@/lib/api/taxonomy";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { Tag } from "@/components/ui-kit";
import { SourcesTable, type SourceRow } from "./_components/SourcesTable";

export const dynamic = "force-dynamic";

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
    sources.map(async (s) => {
      const list = await monitoringApi.listIngests({
        sourceId: s.id,
        limit: 7,
      });
      return [s.id, list.items.map((i) => i.status).reverse()] as const;
    }),
  );
  const recent7BySourceId: Record<string, IngestStatus[]> =
    Object.fromEntries(recent7Pairs);

  const records24hBySourceId = last24h.items.reduce<Record<string, number>>(
    (acc, it) => {
      acc[it.sourceId] = (acc[it.sourceId] ?? 0) + it.recordCount;
      return acc;
    },
    {},
  );

  const latestBySourceId = Object.fromEntries(
    stats.latestPerSource.map((item) => [item.sourceId, item]),
  );

  const coverageByCode: Record<string, SourceCoverage> = coverage
    ? Object.fromEntries(coverage.bySource.map((s) => [s.code, s]))
    : {};

  const rows: SourceRow[] = sources.map((s) => ({
    source: s,
    lastIngest: latestBySourceId[s.id] ?? null,
    recent7: recent7BySourceId[s.id] ?? [],
    records24h: records24hBySourceId[s.id] ?? 0,
    coverage: coverageByCode[s.code] ?? null,
  }));

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="sources" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Tag>&gt; sources</Tag>
            <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
              configured sources · health and coverage
            </h2>
            <p className="font-mono text-xs text-text-muted">
              {rows.length} source{rows.length === 1 ? "" : "s"} · % skill-verified joined from taxonomy coverage
            </p>
          </div>
          <SourcesTable rows={rows} />
        </section>
      </div>
    </main>
  );
}
