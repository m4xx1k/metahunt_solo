import Link from "next/link";

import type { IngestStatus, LatestPerSourceItem, Source } from "@/lib/api/monitoring";
import type { SourceCoverage } from "@/lib/api/taxonomy";
import { StatusBadge } from "@/entities/ingest/StatusBadge";
import { formatCount, formatRelative } from "@/lib/format";
import { Sparkline } from "@/ui/charts/Sparkline";
import { DataTable, type Column } from "@/ui/data/DataTable";

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

const DASH = <span className="text-text-muted">—</span>;

const COLUMNS: Array<Column<SourceRow>> = [
  {
    key: "code",
    header: "code",
    render: (row) => <span className="text-accent">{row.source.code}</span>,
  },
  {
    key: "name",
    header: "name",
    render: (row) => <span className="text-text-primary">{row.source.displayName}</span>,
  },
  {
    key: "lastRun",
    header: "last run",
    render: (row) =>
      row.lastIngest ? (
        <Link
          href={`/dashboard/runs/${row.lastIngest.lastIngestId}`}
          className="text-accent hover:underline"
        >
          {formatRelative(row.lastIngest.lastIngestAt)}
        </Link>
      ) : (
        DASH
      ),
  },
  {
    key: "status",
    header: "status",
    render: (row) => (row.lastIngest ? <StatusBadge status={row.lastIngest.lastStatus} /> : DASH),
  },
  {
    key: "trend",
    header: "last 7",
    render: (row) => {
      const points = row.recent7.map((status) => STATUS_VALUE[status]);
      if (points.length < 2) return DASH;
      return (
        <Sparkline
          points={points}
          width={104}
          height={18}
          stroke={row.recent7.includes("failed") ? "var(--color-danger)" : "var(--color-accent)"}
          ariaLabel={`status of the last ${points.length} runs`}
        />
      );
    },
  },
  {
    key: "records",
    header: "records 24h",
    align: "right",
    render: (row) => <span className="text-text-primary">{formatCount(row.records24h)}</span>,
  },
  {
    key: "coverage",
    header: "skills verified",
    align: "right",
    render: (row) =>
      row.coverage ? (
        <span className="text-text-primary">{row.coverage.pct.toFixed(1)}%</span>
      ) : (
        DASH
      ),
  },
  {
    key: "site",
    header: "site",
    align: "right",
    render: (row) => (
      <a
        href={row.source.baseUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="text-accent hover:underline"
        aria-label={`open ${row.source.displayName} in a new tab`}
      >
        ↗
      </a>
    ),
  },
];

export function SourcesTable({ rows }: { rows: SourceRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.source.id}
      minWidth={920}
      empty="no sources configured"
    />
  );
}
