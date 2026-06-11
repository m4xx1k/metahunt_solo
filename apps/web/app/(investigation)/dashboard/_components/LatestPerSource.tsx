import Link from "next/link";
import type { IngestStatus, LatestPerSourceItem } from "@/lib/api/monitoring";
import { formatRelative } from "@/lib/format";
import { Sparkline } from "@/ui/charts/Sparkline";
import { StatusBadge } from "../../_components/StatusBadge";

const STATUS_VALUE: Record<IngestStatus, number> = {
  completed: 1,
  running: 0.5,
  failed: 0,
};

type Props = {
  items: LatestPerSourceItem[];
  recentBySource: Record<string, IngestStatus[]>;
};

export function LatestPerSource({ items, recentBySource }: Props) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-sm text-text-muted">
        запусків ще не було — запустіть збір з ETL бекенду
      </p>
    );
  }

  return (
    <section className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const recent = recentBySource[item.sourceId] ?? [];
        const sparkPoints = recent.map((s) => STATUS_VALUE[s]);
        const anyFailed = recent.includes("failed");
        return (
          <Link
            key={item.sourceId}
            href={`/dashboard/ingests/${item.lastIngestId}`}
            className="flex h-full flex-col gap-3 border border-border bg-bg-card p-5 shadow-[4px_4px_0_0_#000] transition-shadow hover:shadow-[6px_6px_0_0_#000]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-lg font-bold text-text-primary">
                {item.sourceDisplayName ?? item.sourceCode ?? item.sourceId}
              </span>
              <StatusBadge status={item.lastStatus} />
            </div>
            <div className="flex flex-col gap-1 font-mono text-xs">
              <span className="text-text-muted">
                старт · {formatRelative(item.lastIngestAt)}
              </span>
              <span className="text-text-muted">
                завершення · {formatRelative(item.lastFinishedAt)}
              </span>
            </div>
            <div className="mt-auto flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                останні {sparkPoints.length || 0} запусків
              </span>
              {sparkPoints.length >= 2 ? (
                <Sparkline
                  points={sparkPoints}
                  width={120}
                  height={20}
                  stroke={
                    anyFailed
                      ? "var(--color-danger)"
                      : "var(--color-accent)"
                  }
                  ariaLabel={`Останні ${sparkPoints.length} запусків`}
                />
              ) : (
                <span className="font-mono text-[10px] text-text-muted">
                  недостатньо даних
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </section>
  );
}
