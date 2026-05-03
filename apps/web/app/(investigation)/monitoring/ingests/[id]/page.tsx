import { notFound } from "next/navigation";
import { monitoringApi } from "@/lib/api/monitoring";
import { InvestigationHeader } from "../../../_components/InvestigationHeader";
import { StatusBadge } from "../../../_components/StatusBadge";
import { RssRecordCard } from "../../../_components/RssRecordCard";
import { Pagination } from "../../../_components/Pagination";
import { Tag } from "@/components/ui-kit";
import {
  formatCount,
  formatDateTime,
  formatDuration,
  formatRelative,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const RECORDS_LIMIT = 20;

function asString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function asInt(v: string | string[] | undefined, fallback: number): number {
  const s = asString(v);
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default async function IngestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const offset = asInt(sp.offset, 0);

  const ingest = await monitoringApi.getIngest(id).catch((err) => {
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
    throw err;
  });

  if (!ingest) notFound();

  const records = await monitoringApi.listRecords({
    ingestId: id,
    limit: RECORDS_LIMIT,
    offset,
  });

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader
        title="ingest"
        breadcrumbs={[
          { label: "ingests" },
          { label: ingest.id.slice(0, 8) },
        ]}
      />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10 md:px-20">
        <header className="flex flex-col gap-4">
          <Tag>{ingest.sourceDisplayName ?? ingest.sourceCode ?? "source"}</Tag>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-text-primary md:text-4xl">
              ingest {ingest.id.slice(0, 8)}…
            </h1>
            <StatusBadge status={ingest.status} />
          </div>
          <p className="font-mono text-xs text-text-muted">
            triggered by · {ingest.triggeredBy}
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Stat label="started" value={formatDateTime(ingest.startedAt)} />
          <Stat
            label="finished"
            value={formatRelative(ingest.finishedAt)}
            sub={
              ingest.finishedAt
                ? formatDateTime(ingest.finishedAt)
                : "still running"
            }
          />
          <Stat label="duration" value={formatDuration(ingest.durationMs)} />
          <Stat
            label="records"
            value={formatCount(ingest.recordCount)}
            sub={`${formatCount(ingest.extractedCount)} extracted`}
          />
        </section>

        {ingest.errorMessage ? (
          <section className="flex flex-col gap-3">
            <Tag>{"> error"}</Tag>
            <pre className="overflow-x-auto border border-danger bg-bg-card p-4 font-mono text-xs leading-relaxed text-danger">
              {ingest.errorMessage}
            </pre>
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <Tag>{"> records"}</Tag>
          <p className="font-mono text-xs text-text-muted">
            {records.total} records produced by this ingest
          </p>
          {records.items.length === 0 ? (
            <p className="font-mono text-sm text-text-muted">
              no records produced by this ingest
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
            basePath={`/monitoring/ingests/${ingest.id}`}
            searchParams={{ offset: offset > 0 ? String(offset) : undefined }}
          />
        </section>

        {ingest.workflowRunId || ingest.payloadStorageKey ? (
          <section className="flex flex-col gap-3">
            <Tag>{"> meta"}</Tag>
            <dl className="grid gap-2 border border-border bg-bg-card p-4 font-mono text-xs">
              {ingest.workflowRunId ? (
                <Row label="workflow run id" value={ingest.workflowRunId} />
              ) : null}
              {ingest.payloadStorageKey ? (
                <Row
                  label="payload storage"
                  value={ingest.payloadStorageKey}
                />
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-bg-card p-5 shadow-[4px_4px_0_0_#000]">
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span className="font-display text-2xl font-bold text-text-primary">
        {value}
      </span>
      {sub ? (
        <span className="font-mono text-xs text-text-secondary">{sub}</span>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:gap-4">
      <dt className="text-text-muted sm:w-40">{label}</dt>
      <dd className="break-all text-text-primary">{value}</dd>
    </div>
  );
}
