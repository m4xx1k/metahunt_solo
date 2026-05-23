import Link from "next/link";
import {
  monitoringApi,
  type IngestStatus,
  type StatsPeriod,
} from "@/lib/api/monitoring";
import { taxonomyApi } from "@/lib/api/taxonomy";
import { dedupApi } from "@/lib/api/dedup";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { Tag } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { formatCount, formatUsd, formatTokens } from "@/lib/format";
import { KpiCard } from "./_components/KpiCard";
import { LatestPerSource } from "./_components/LatestPerSource";
import { ActivityStream } from "./_components/ActivityStream";
import { FailedIngestsDrawer } from "./_components/FailedIngestsDrawer";
import { PeriodSelector } from "./_components/PeriodSelector";
import { FunnelWidget } from "./_components/FunnelWidget";
import { TaxonomyHealth } from "./_components/TaxonomyHealth";
import { DedupQualityWidget } from "./_components/DedupQualityWidget";

export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  "24h": "за 24 години",
  week: "за 7 днів",
  all: "за весь час",
};

const PERIOD_MS: Record<StatsPeriod, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  all: null,
};

function parsePeriod(raw: unknown): StatsPeriod {
  if (raw === "week" || raw === "all") return raw;
  return "24h";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);

  const [stats, sources, recent, failedAll, coverage, dedupMetrics] =
    await Promise.all([
      monitoringApi.stats(period),
      monitoringApi.sources(),
      monitoringApi.listIngests({ limit: 10 }),
      monitoringApi.listIngests({ status: "failed", limit: 50 }),
      taxonomyApi.coverage().catch(() => null),
      dedupApi
        .list({ pageSize: 1 })
        .then((r) => r.metrics)
        .catch(() => null),
    ]);

  const perSourceLast7 = await Promise.all(
    sources.map(async (s) => {
      const list = await monitoringApi.listIngests({
        sourceId: s.id,
        limit: 7,
      });
      return [s.id, list.items.map((i) => i.status).reverse()] as const;
    }),
  );
  const recentBySource: Record<string, IngestStatus[]> = Object.fromEntries(
    perSourceLast7,
  );

  // Period-scoped failed list for the side drawer. The backend stats
  // already returns the count, but the drawer needs the actual ingest
  // rows — server returns the newest 50 unfiltered, we trim here.
  const sinceMs = PERIOD_MS[period];
  // eslint-disable-next-line react-hooks/purity -- per-request server snapshot
  const cutoff = sinceMs === null ? 0 : Date.now() - sinceMs;
  const failedItems = failedAll.items.filter((i) => {
    const t = new Date(i.startedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  const periodLabel = PERIOD_LABEL[period];

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="операційний дашборд" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10 md:px-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Tag>{`> огляд`}</Tag>
            <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
              пайплайн загалом ·{" "}
              <span className="text-accent">{periodLabel}</span>
            </h2>
          </div>
          <PeriodSelector current={period} />
        </div>

        {/* Пояс 1 — Hero KPIs */}
        <section className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="унікальних позицій · Gold">
            <span className="font-display text-4xl font-bold leading-none text-accent">
              {formatCount(stats.funnel.gold)}
            </span>
            <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
              нових Golden Records {periodLabel}
            </span>
          </KpiCard>

          <KpiCard label="зібрано · Silver">
            <span className="font-display text-4xl font-bold leading-none text-text-primary">
              {formatCount(stats.funnel.silver)}
            </span>
            <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
              структуровано через LLM
            </span>
          </KpiCard>

          <KpiCard label="дублікатів злито">
            <span className="font-display text-4xl font-bold leading-none text-text-primary">
              {formatCount(stats.funnel.duplicatesMerged)}
            </span>
            <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
              приєдналися до існуючих груп
            </span>
          </KpiCard>

          <Link href="/dashboard/extraction" className="contents">
            <KpiCard label="витрати LLM">
              <span className="font-display text-4xl font-bold leading-none text-accent">
                {formatUsd(stats.llmCost.costUsd)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {formatCount(stats.llmCost.count)} викликів ·{" "}
                {formatTokens(stats.llmCost.tokensIn)} токенів in
              </span>
            </KpiCard>
          </Link>

          <FailedIngestsDrawer
            count={stats.ingests.failed}
            failedIngests={failedItems}
            trigger={
              <KpiCard
                label="помилки збору"
                tone={stats.ingests.failed > 0 ? "danger" : "default"}
              >
                <span
                  className={cn(
                    "font-display text-4xl font-bold leading-none",
                    stats.ingests.failed > 0
                      ? "text-danger"
                      : "text-text-primary",
                  )}
                >
                  {formatCount(stats.ingests.failed)}
                </span>
                <span className="mt-auto font-mono text-xs text-text-secondary">
                  {stats.ingests.failed > 0
                    ? "натисніть для перегляду"
                    : "без помилок"}
                </span>
              </KpiCard>
            }
          />
        </section>

        {/* Пояс 2 — ETL воронка */}
        <FunnelWidget funnel={stats.funnel} />

        {/* Пояс 3a — Джерела */}
        <Section
          tag="> джерела"
          title="останній запуск за джерелом"
          subtitle="натисніть картку, щоб відкрити деталі запуску"
        >
          <LatestPerSource
            items={stats.latestPerSource}
            recentBySource={recentBySource}
          />
        </Section>

        {/* Пояс 3b — Довідник + дедуплікація */}
        <div className="grid gap-4 lg:grid-cols-2">
          <TaxonomyHealth coverage={coverage} />
          <DedupQualityWidget metrics={dedupMetrics} />
        </div>

        {/* Пояс 4 — Активність */}
        <Section tag="> активність" title="останні запуски">
          <ActivityStream items={recent.items} />
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
