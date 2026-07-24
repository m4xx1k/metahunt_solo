import type { ProductChannel } from "@/lib/api/product-analytics";
import { formatCount, formatPercent } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";

const COLUMNS: Array<Column<ProductChannel>> = [
  {
    key: "source",
    header: "source",
    render: (row) => (
      <span className={row.source ? "text-accent" : "text-text-muted"}>
        {row.source ?? "direct"}
      </span>
    ),
  },
  {
    key: "landed",
    header: "landed",
    align: "right",
    render: (row) => <span className="text-text-primary">{formatCount(row.landed)}</span>,
  },
  {
    key: "subscribed",
    header: "subs",
    align: "right",
    render: (row) => formatCount(row.subscribed),
  },
  {
    key: "activated",
    header: "activated",
    align: "right",
    render: (row) => formatCount(row.activated),
  },
  {
    key: "conversion",
    header: "landed → sub",
    align: "right",
    render: (row) => (
      <span className="text-text-primary">{formatPercent(row.subscribed, row.landed)}</span>
    ),
  },
];

// First-touch channels: the utm_source on a journey's earliest landing event.
export function ChannelsPanel({
  channels,
  period,
}: {
  channels: ProductChannel[];
  period: string;
}) {
  return (
    <Panel title="Channels" meta={`first touch · ${period}`}>
      {channels.length === 0 ? (
        <EmptyState title="no landings in this window" hint="nobody opened a landing page here." />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={channels}
          rowKey={(row) => row.source ?? "direct"}
          minWidth={520}
        />
      )}
    </Panel>
  );
}
