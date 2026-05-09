import Link from "next/link";
import type {
  IngestStatus,
  LatestPerSourceItem,
  Source,
} from "@/lib/api/monitoring";
import type { SourceCoverage } from "@/lib/api/taxonomy";
import { Sparkline } from "@/components/data/Sparkline";
import { StatusBadge } from "../../_components/StatusBadge";
import { formatCount, formatRelative } from "@/lib/format";

const STATUS_VALUE: Record<IngestStatus, number> = {
  completed: 1,
  running: 0.5,
  failed: 0,
};

export type SourceRow = {
  source: Source;
  lastIngest: LatestPerSourceItem | null;
  recent7: IngestStatus[];
  records24h: number;
  coverage: SourceCoverage | null;
};

export function SourcesTable({ rows }: { rows: SourceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-mono text-sm text-text-muted">
        no sources configured
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-border bg-bg-card shadow-[6px_6px_0_0_#000]">
      <table className="min-w-full font-mono text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-elev text-[11px] uppercase tracking-wider text-text-muted">
            <Th>code</Th>
            <Th>display name</Th>
            <Th>last ingest</Th>
            <Th>status</Th>
            <Th>7-run trend</Th>
            <Th align="right">24h records</Th>
            <Th align="right">% skill-verified</Th>
            <Th>open</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SourceRowView key={row.source.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceRowView({ row }: { row: SourceRow }) {
  const { source, lastIngest, recent7, records24h, coverage } = row;
  const sparkPoints = recent7.map((s) => STATUS_VALUE[s]);
  const anyFailed = recent7.includes("failed");
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-bg-elev">
      <Td>
        <span className="text-accent">{source.code}</span>
      </Td>
      <Td>
        <span className="text-text-primary">{source.displayName}</span>
      </Td>
      <Td>
        {lastIngest ? (
          <Link
            href={`/dashboard/ingests/${lastIngest.lastIngestId}`}
            className="text-accent hover:underline"
          >
            {formatRelative(lastIngest.lastIngestAt)}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Td>
      <Td>
        {lastIngest ? (
          <StatusBadge status={lastIngest.lastStatus} />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Td>
      <Td>
        {sparkPoints.length >= 2 ? (
          <Sparkline
            points={sparkPoints}
            width={120}
            height={20}
            stroke={
              anyFailed ? "var(--color-danger)" : "var(--color-accent)"
            }
            ariaLabel={`Last ${sparkPoints.length} run statuses`}
          />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Td>
      <Td align="right">
        <span className="text-text-primary">{formatCount(records24h)}</span>
      </Td>
      <Td align="right">
        {coverage ? (
          <span className="text-text-primary">{coverage.pct.toFixed(1)}%</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </Td>
      <Td>
        <a
          href={source.baseUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent hover:underline"
          aria-label={`Open ${source.displayName} in new tab`}
        >
          ↗
        </a>
      </Td>
    </tr>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </td>
  );
}
