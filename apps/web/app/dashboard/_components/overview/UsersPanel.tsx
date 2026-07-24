import type { SubscriberActivity } from "@/lib/api/product-analytics";
import { LastAction } from "@/entities/subscriber/LastAction";
import { SubscriberIdentity } from "@/entities/subscriber/SubscriberIdentity";
import { formatCount, formatRelative } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";
import { PanelLink } from "@/ui/navigation/PanelLink";

const COLUMNS: Array<Column<SubscriberActivity>> = [
  {
    key: "subscriber",
    header: "subscriber",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <SubscriberIdentity
          tgUsername={row.tgUsername}
          tgFirstName={row.tgFirstName}
          chatId={row.chatId}
        />
        {row.isActive ? null : (
          <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
            off
          </span>
        )}
      </span>
    ),
  },
  {
    key: "joined",
    header: "joined",
    render: (row) => (
      <span className="tabular-nums text-text-secondary">{formatRelative(row.joinedAt)}</span>
    ),
  },
  {
    key: "lastAction",
    header: "last action",
    render: (row) => <LastAction at={row.lastActionAt} />,
  },
  {
    key: "digestClicks",
    header: "digest clicks",
    align: "right",
    render: (row) => formatCount(row.vacancyClicks),
  },
  {
    key: "feedClicks",
    header: "feed clicks",
    align: "right",
    render: (row) => formatCount(row.feedClicks),
  },
];

// The first thing on the console: who is actually here. A subscriber is in the
// window if they joined in it or did something in it — so an old subscriber who
// clicked today still shows on 24h.
export function UsersPanel({
  subscribers,
  period,
}: {
  subscribers: SubscriberActivity[];
  period: string;
}) {
  return (
    <Panel title="Users" meta={`${subscribers.length} active or joined · ${period}`}>
      {subscribers.length === 0 ? (
        <EmptyState
          title="nobody in this window"
          hint="no subscriber joined or acted here — widen the period."
        />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={subscribers}
          rowKey={(row) => row.chatId}
          minWidth={720}
        />
      )}
      <div className="mt-auto pt-1">
        <PanelLink href="/dashboard/analytics?tab=subscribers">full subscriber ledger</PanelLink>
      </div>
    </Panel>
  );
}
