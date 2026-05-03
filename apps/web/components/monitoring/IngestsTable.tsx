import Link from "next/link";
import type { IngestListItem } from "@/lib/api/monitoring";
import { formatDateTime, formatDuration, formatCount } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const COLS =
  "grid grid-cols-[minmax(140px,1fr)_110px_minmax(160px,1fr)_120px_120px_120px] gap-4 items-center";

export function IngestsTable({ items }: { items: IngestListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-sm text-text-muted">
        no ingests match the filters
      </p>
    );
  }

  return (
    <div className="border border-border bg-bg-card shadow-[6px_6px_0_0_#000]">
      <div
        className={`${COLS} border-b border-border bg-bg-elev px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-text-muted`}
      >
        <span>source</span>
        <span>status</span>
        <span>started</span>
        <span>duration</span>
        <span>records</span>
        <span>extracted</span>
      </div>
      <ul>
        {items.map((it) => (
          <li
            key={it.id}
            className="border-b border-border last:border-b-0 hover:bg-bg-elev"
          >
            <Link
              href={`/monitoring/ingests/${it.id}`}
              className={`${COLS} px-5 py-3 font-mono text-sm`}
            >
              <span className="truncate text-text-primary">
                {it.sourceDisplayName ?? it.sourceCode ?? "—"}
              </span>
              <StatusBadge status={it.status} />
              <span className="truncate text-text-secondary">
                {formatDateTime(it.startedAt)}
              </span>
              <span className="text-text-secondary">
                {formatDuration(it.durationMs)}
              </span>
              <span className="text-text-primary">
                {formatCount(it.recordCount)}
              </span>
              <span className="text-accent">
                {formatCount(it.extractedCount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
