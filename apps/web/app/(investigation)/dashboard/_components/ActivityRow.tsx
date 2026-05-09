import Link from "next/link";
import type { IngestListItem } from "@/lib/api/monitoring";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";

function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_GLYPH: Record<IngestListItem["status"], string> = {
  completed: "✓",
  failed: "✕",
  running: "·",
};

const STATUS_COLOR: Record<IngestListItem["status"], string> = {
  completed: "text-success",
  failed: "text-danger",
  running: "text-text-muted",
};

export function ActivityRow({ item }: { item: IngestListItem }) {
  const ingestHref = `/dashboard/ingests/${item.id}`;
  const shortId = item.id.slice(0, 4);
  const source = item.sourceCode ?? item.sourceDisplayName ?? "src";
  const failed = item.status === "failed";

  return (
    <li className="grid grid-cols-[60px_24px_minmax(80px,120px)_1fr] items-baseline gap-3 px-4 py-3 font-mono text-sm">
      <span className="text-text-muted">{formatClockTime(item.startedAt)}</span>
      <span className={cn("text-base font-bold", STATUS_COLOR[item.status])}>
        {STATUS_GLYPH[item.status]}
      </span>
      <span className="truncate text-text-secondary">{source}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <Link href={ingestHref} className="text-accent hover:underline">
          ingest #{shortId}
        </Link>
        <span className="text-text-muted">→</span>
        <Link
          href={ingestHref}
          className="text-text-secondary hover:text-text-primary"
        >
          {formatCount(item.recordCount)} records
        </Link>
        {failed && item.errorMessage ? (
          <span className="ml-2 truncate text-xs text-danger">
            — {item.errorMessage}
          </span>
        ) : null}
      </span>
    </li>
  );
}
