import type { ProductChannel } from "@/lib/api/product-analytics";
import { formatCount, formatPercent } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";
import { InfoHint } from "@/ui/overlay/InfoHint";

const COLUMNS: Array<Column<ProductChannel>> = [
  {
    key: "source",
    header: "source · campaign",
    render: (row) => (
      <span className={row.source === "direct" ? "text-text-muted" : "text-accent"}>
        {row.source}
        {row.campaign ? (
          <span className="pl-1.5 font-mono text-2xs text-text-muted">· {row.campaign}</span>
        ) : null}
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

// First touch per journey: the utm_source on its earliest landing event, or the
// referrer folded into a channel when the link carried no tags.
export function ChannelsPanel({
  channels,
  period,
  className,
}: {
  channels: ProductChannel[];
  period: string;
  className?: string;
}) {
  return (
    <Panel
      title="Channels"
      meta={`first touch · ${period}`}
      scope="period"
      className={className}
      footer={
        <span className="inline-flex items-center gap-1.5 text-text-muted">
          untagged links resolve by referrer
          <InfoHint label="how untagged traffic is attributed">
            A tagged link always wins. Without tags we fall back to the referring domain, so Threads
            and Telegram stop hiding in direct. Referrers only exist for traffic that arrived after
            this shipped, and in-app browsers often send none at all — direct shrinks, it never
            empties.
          </InfoHint>
        </span>
      }
    >
      {channels.length === 0 ? (
        <EmptyState title="no landings in this window" hint="nobody opened a landing page here." />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={channels}
          rowKey={(row) => `${row.source}:${row.campaign ?? ""}`}
          minWidth={520}
        />
      )}
    </Panel>
  );
}
