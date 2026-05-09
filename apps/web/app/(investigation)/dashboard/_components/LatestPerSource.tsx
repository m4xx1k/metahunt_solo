import Link from "next/link";
import type { LatestPerSourceItem } from "@/lib/api/monitoring";
import { formatRelative } from "@/lib/format";
import { StatusBadge } from "../../_components/StatusBadge";

export function LatestPerSource({
  items,
}: {
  items: LatestPerSourceItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-sm text-text-muted">
        no ingests yet — trigger one from the ETL backend
      </p>
    );
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.sourceId}
          href={`/dashboard/ingests/${item.lastIngestId}`}
          className="flex flex-col gap-3 border border-border bg-bg-card p-5 shadow-[4px_4px_0_0_#000] transition-shadow hover:shadow-[6px_6px_0_0_#000]"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-lg font-bold text-text-primary">
              {item.sourceDisplayName ?? item.sourceCode ?? item.sourceId}
            </span>
            <StatusBadge status={item.lastStatus} />
          </div>
          <div className="flex flex-col gap-1 font-mono text-xs">
            <span className="text-text-muted">
              started · {formatRelative(item.lastIngestAt)}
            </span>
            <span className="text-text-muted">
              finished · {formatRelative(item.lastFinishedAt)}
            </span>
          </div>
        </Link>
      ))}
    </section>
  );
}
