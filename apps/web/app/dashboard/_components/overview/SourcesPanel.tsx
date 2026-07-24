import Link from "next/link";

import type { LatestPerSourceItem } from "@/lib/api/monitoring";
import { StatusBadge } from "@/entities/ingest/StatusBadge";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

export function SourcesPanel({ items }: { items: LatestPerSourceItem[] }) {
  return (
    <Panel title="Sources" meta={`${items.length} configured`} bodyClassName="gap-3 p-0 pt-2">
      {items.length === 0 ? (
        <div className="px-5 pb-3">
          <EmptyState title="no runs yet" hint="trigger a collection from the ETL backend." />
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.sourceId}>
              <Link
                href={`/dashboard/runs/${item.lastIngestId}`}
                className="flex items-baseline justify-between gap-3 px-5 py-2.5 font-mono text-xs transition-colors hover:bg-bg-elev"
              >
                <span className="truncate text-text-primary">
                  {item.sourceDisplayName ?? item.sourceCode ?? item.sourceId}
                </span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <StatusBadge status={item.lastStatus} />
                  <span className="tabular-nums text-text-muted">
                    {formatRelative(item.lastIngestAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto px-5 pb-4 pt-1">
        <PanelLink href="/dashboard/sources">coverage</PanelLink>
      </div>
    </Panel>
  );
}
