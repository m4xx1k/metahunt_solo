import { notFound } from "next/navigation";

import { monitoringApi } from "@/lib/api/monitoring";
import { nonNegativeIntegerSearchParam } from "@/lib/search-params";
import { formatCount, formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { RssRecordCard } from "@/entities/rss-record/RssRecordCard";
import { StatusBadge } from "@/entities/ingest/StatusBadge";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { StatRows } from "@/ui/data/StatRows";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Panel } from "@/ui/layout/Panel";
import { BackLink } from "@/ui/navigation/BackLink";
import { Pagination } from "@/ui/navigation/Pagination";

export const dynamic = "force-dynamic";

const RECORDS_LIMIT = 20;

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const offset = nonNegativeIntegerSearchParam(sp.offset);

  const run = await monitoringApi.getIngest(id).catch((err) => {
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
    throw err;
  });

  if (!run) notFound();

  const records = await monitoringApi.listRecords({ ingestId: id, limit: RECORDS_LIMIT, offset });
  const source = run.sourceDisplayName ?? run.sourceCode ?? "source";

  return (
    <>
      <PageHeader
        title={`Run ${run.id.slice(0, 8)}`}
        hint={`${source} · triggered by ${run.triggeredBy}`}
        eyebrow={<BackLink href="/dashboard/runs">runs</BackLink>}
        actions={<StatusBadge status={run.status} />}
      />

      <PageBody>
        <StatGrid cols={4}>
          <StatCard
            label="started"
            value={formatRelative(run.startedAt)}
            hint={formatDateTime(run.startedAt)}
          />
          <StatCard
            label="finished"
            value={formatRelative(run.finishedAt)}
            hint={run.finishedAt ? formatDateTime(run.finishedAt) : "still running"}
          />
          <StatCard label="duration" value={formatDuration(run.durationMs)} />
          <StatCard
            label="records"
            value={formatCount(run.recordCount)}
            hint={`${formatCount(run.succeededCount)} structured · ${formatCount(run.failedCount)} failed · ${formatCount(run.pendingCount)} pending`}
          />
        </StatGrid>

        {run.errorMessage ? (
          <Panel title="Error" className="border-danger/60">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-danger">
              {run.errorMessage}
            </pre>
          </Panel>
        ) : null}

        {run.workflowRunId || run.payloadStorageKey ? (
          <Panel title="Internals">
            <StatRows
              rows={[
                ...(run.workflowRunId ? [{ label: "workflow run", value: run.workflowRunId }] : []),
                ...(run.payloadStorageKey
                  ? [{ label: "payload key", value: run.payloadStorageKey }]
                  : []),
              ]}
            />
          </Panel>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-text-primary">Records</h2>
            <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
              {formatCount(records.total)} from this run
            </span>
          </div>
          {records.items.length === 0 ? (
            <EmptyState title="this run produced no records" />
          ) : (
            <div className="flex flex-col gap-3">
              {records.items.map((record) => (
                <RssRecordCard key={record.id} record={record} />
              ))}
            </div>
          )}
          <Pagination
            total={records.total}
            limit={records.limit}
            offset={records.offset}
            basePath={`/dashboard/runs/${run.id}`}
            searchParams={{ offset: offset > 0 ? String(offset) : undefined }}
          />
        </section>
      </PageBody>
    </>
  );
}
