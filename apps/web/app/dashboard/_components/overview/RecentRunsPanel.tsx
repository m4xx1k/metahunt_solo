import type { IngestListItem } from "@/lib/api/monitoring";
import { RunList } from "@/entities/ingest/RunRow";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

export function RecentRunsPanel({ runs }: { runs: IngestListItem[] }) {
  return (
    <Panel title="Recent runs" meta={`${runs.length} newest`} bodyClassName="gap-3 p-0 pt-2">
      {runs.length === 0 ? (
        <div className="px-5 pb-3">
          <EmptyState title="no activity yet" hint="trigger a collection from the ETL backend." />
        </div>
      ) : (
        <RunList runs={runs} />
      )}
      <div className="px-5 pb-4 pt-1">
        <PanelLink href="/dashboard/runs">all runs</PanelLink>
      </div>
    </Panel>
  );
}
