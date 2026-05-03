import { monitoringApi, type IngestStatus } from "@/lib/api/monitoring";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { Pagination } from "../_components/Pagination";
import { RssRecordCard } from "../_components/RssRecordCard";
import { StatsOverview } from "./_components/StatsOverview";
import { LatestPerSource } from "./_components/LatestPerSource";
import { IngestsTable } from "./_components/IngestsTable";
import { RecordsFilters } from "./_components/RecordsFilters";
import { Tag } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const RECORDS_LIMIT = 20;
const VALID_STATUSES: ReadonlySet<IngestStatus> = new Set([
  "running",
  "completed",
  "failed",
]);

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asInt(v: string | string[] | undefined, fallback: number): number {
  const s = asString(v);
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sourceId = asString(sp.sourceId);
  const extractedRaw = asString(sp.extracted);
  const extracted =
    extractedRaw === "true"
      ? true
      : extractedRaw === "false"
        ? false
        : undefined;
  const q = asString(sp.q);
  const offset = asInt(sp.offset, 0);
  const status = (() => {
    const s = asString(sp.status);
    return s && VALID_STATUSES.has(s as IngestStatus)
      ? (s as IngestStatus)
      : undefined;
  })();

  const [stats, sources, ingests, records] = await Promise.all([
    monitoringApi.stats(),
    monitoringApi.sources(),
    monitoringApi.listIngests({ limit: 10, status }),
    monitoringApi.listRecords({
      sourceId,
      extracted,
      q,
      limit: RECORDS_LIMIT,
      offset,
    }),
  ]);

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="ETL monitoring" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <Section tag="> overview" title="pipeline at a glance">
          <StatsOverview stats={stats} />
        </Section>

        <Section
          tag="> sources"
          title="latest run per source"
          subtitle="click a card to open the ingest detail"
        >
          <LatestPerSource items={stats.latestPerSource} />
        </Section>

        <Section tag="> ingests" title="last 10 ingest runs">
          <IngestsTable items={ingests.items} />
        </Section>

        <Section
          tag="> records"
          title="rss records"
          subtitle={`${records.total} total · sorted by published date`}
        >
          <div className="flex flex-col gap-6">
            <RecordsFilters sources={sources} />
            {records.items.length === 0 ? (
              <p className="font-mono text-sm text-text-muted">
                no records match the filters
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                {records.items.map((r) => (
                  <RssRecordCard key={r.id} record={r} />
                ))}
              </div>
            )}
            <Pagination
              total={records.total}
              limit={records.limit}
              offset={records.offset}
              basePath="/monitoring"
              searchParams={flatSearchParams}
            />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({
  tag,
  title,
  subtitle,
  children,
}: {
  tag: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Tag>{tag}</Tag>
        <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-mono text-xs text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
