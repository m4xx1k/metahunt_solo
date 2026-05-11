import Link from "next/link";
import {
  monitoringApi,
  type IngestListItem,
  type IngestStatus,
} from "@/lib/api/monitoring";
import { taxonomyApi } from "@/lib/api/taxonomy";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { Tag } from "@/components/ui-kit";
import { Sparkline } from "@/components/data/Sparkline";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import { KpiCard } from "./_components/KpiCard";
import { LatestPerSource } from "./_components/LatestPerSource";
import { ActivityStream } from "./_components/ActivityStream";
import { FailedIngestsDrawer } from "./_components/FailedIngestsDrawer";

export const dynamic = "force-dynamic";

const STATUS_VALUE: Record<IngestStatus, number> = {
  completed: 1,
  running: 0.5,
  failed: 0,
};

const ONE_DAY_MS = 24 * 3600 * 1000;
const SKILL_AMBER = 1000;
const SKILL_RED = 5000;

export default async function DashboardPage() {
  const [stats, sources, recent, failedAll, coverage] = await Promise.all([
    monitoringApi.stats(),
    monitoringApi.sources(),
    monitoringApi.listIngests({ limit: 10 }),
    monitoringApi.listIngests({ status: "failed", limit: 20 }),
    taxonomyApi.coverage().catch(() => null),
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

  const last7 = recent.items.slice(0, 7).reverse();
  const ingestsSparkline = last7.map((i) => STATUS_VALUE[i.status]);
  const recordsSparkline = last7.map((i) => i.recordCount);

  // eslint-disable-next-line react-hooks/purity -- per-request snapshot in a server component
  const cutoff = Date.now() - ONE_DAY_MS;
  const failed24h = failedAll.items.filter((i) => {
    const t = new Date(i.startedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  const taxRole = coverage?.byAxis.role.new ?? 0;
  const taxSkill = coverage?.byAxis.skill.new ?? 0;
  const taxDomain = coverage?.byAxis.domain.new ?? 0;
  const taxTotal = taxRole + taxSkill + taxDomain;

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="dashboard" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <nav className="flex flex-wrap items-center gap-4 font-mono text-xs uppercase tracking-wider">
          <Link
            href="/dashboard/extraction"
            className="text-text-muted hover:text-accent"
          >
            → extraction cost
          </Link>
        </nav>
        <Section tag="> overview" title="pipeline at a glance">
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-4">
            <IngestsKpi
              value={stats.ingests.last24h}
              sparkline={ingestsSparkline}
            />
            <RecordsKpi
              value={stats.records.last24h}
              sparkline={recordsSparkline}
            />
            <FailedKpi count={failed24h.length} failedIngests={failed24h} />
            <TaxonomyKpi
              role={taxRole}
              skill={taxSkill}
              domain={taxDomain}
              total={taxTotal}
              available={coverage !== null}
            />
          </div>
        </Section>

        <Section
          tag="> sources"
          title="latest run per source"
          subtitle="click a card to open the ingest detail"
        >
          <LatestPerSource
            items={stats.latestPerSource}
            recentBySource={recentBySource}
          />
        </Section>

        <Section
          tag="> activity"
          title="recent ingests · click to drill in"
        >
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

function IngestsKpi({
  value,
  sparkline,
}: {
  value: number;
  sparkline: number[];
}) {
  return (
    <KpiCard label="ingests · last 24h">
      <span className="font-display text-4xl font-bold leading-none text-text-primary">
        {formatCount(value)}
      </span>
      <div className="mt-auto flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          last {sparkline.length} runs · status
        </span>
        <Sparkline
          points={sparkline}
          width={180}
          height={28}
          ariaLabel="Recent ingest run statuses"
        />
      </div>
    </KpiCard>
  );
}

function RecordsKpi({
  value,
  sparkline,
}: {
  value: number;
  sparkline: number[];
}) {
  return (
    <KpiCard label="records · last 24h">
      <span className="font-display text-4xl font-bold leading-none text-accent">
        {formatCount(value)}
      </span>
      <div className="mt-auto flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          last {sparkline.length} runs · volume
        </span>
        <Sparkline
          points={sparkline}
          width={180}
          height={28}
          ariaLabel="Records per recent ingest"
        />
      </div>
    </KpiCard>
  );
}

function FailedKpi({
  count,
  failedIngests,
}: {
  count: number;
  failedIngests: IngestListItem[];
}) {
  const tone = count > 0 ? "danger" : "default";
  return (
    <FailedIngestsDrawer
      count={count}
      failedIngests={failedIngests}
      trigger={
        <KpiCard label="failed · last 24h" tone={tone}>
          <span
            className={cn(
              "font-display text-4xl font-bold leading-none",
              count > 0 ? "text-danger" : "text-text-primary",
            )}
          >
            {count}
          </span>
          <span className="mt-auto font-mono text-xs text-text-secondary">
            {count > 0 ? "click to inspect" : "all clear"}
          </span>
        </KpiCard>
      }
    />
  );
}

function TaxonomyKpi({
  role,
  skill,
  domain,
  total,
  available,
}: {
  role: number;
  skill: number;
  domain: number;
  total: number;
  available: boolean;
}) {
  if (!available) {
    return (
      <KpiCard label="taxonomy queue · NEW">
        <span className="font-mono text-sm text-text-muted">
          coverage api unavailable
        </span>
      </KpiCard>
    );
  }
  const skillClass =
    skill >= SKILL_RED
      ? "text-danger"
      : skill >= SKILL_AMBER
        ? "text-accent"
        : "text-text-primary";
  return (
    <KpiCard label="taxonomy queue · NEW">
      <ul className="flex flex-col gap-1 font-mono">
        <AxisRow axis="ROLE" count={role} />
        <AxisRow axis="SKILL" count={skill} valueClassName={skillClass} />
        <AxisRow axis="DOMAIN" count={domain} />
      </ul>
      <span className="mt-auto font-mono text-xs text-text-secondary">
        total · {formatCount(total)}
      </span>
    </KpiCard>
  );
}

function AxisRow({
  axis,
  count,
  valueClassName,
}: {
  axis: "ROLE" | "SKILL" | "DOMAIN";
  count: number;
  valueClassName?: string;
}) {
  return (
    <li>
      <Link
        href={`/taxonomy?tab=${axis.toLowerCase()}`}
        className="flex items-baseline justify-between gap-3 hover:text-accent"
      >
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {axis}
        </span>
        <span
          className={cn(
            "text-base font-bold",
            valueClassName ?? "text-text-primary",
          )}
        >
          {formatCount(count)}
        </span>
      </Link>
    </li>
  );
}
