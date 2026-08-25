import type { ProductDeliveryHealth } from "@/lib/api/product-analytics";
import { formatCount } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { Panel } from "@/ui/layout/Panel";

type DeliveryDay = ProductDeliveryHealth["daily"][number];

const COLUMNS: Array<Column<DeliveryDay>> = [
  { key: "date", header: "day", render: (row) => <span className="font-mono">{row.date}</span> },
  { key: "digests", header: "digests", align: "right", render: (row) => formatCount(row.digests) },
  { key: "chats", header: "chats", align: "right", render: (row) => formatCount(row.chats) },
  {
    key: "perChat",
    header: "per chat",
    align: "right",
    render: (row) => row.perChat.toFixed(1),
  },
];

// What OUR pipeline did, counted from `sent_notifications` — the domain record
// of "already sent". A digest is one send to one subscription: rows land one per
// vacancy inside it, and the schedule is hourly, so the hour is the send.
export function DeliveryPanel({
  delivery,
  period,
}: {
  delivery: ProductDeliveryHealth;
  period: string;
}) {
  return (
    <Panel title="Delivery" meta={`digests sent · ${period}`} scope="period">
      <StatGrid cols={3}>
        <StatCard label="digests" value={formatCount(delivery.digestsSent)} hint={period} />
        <StatCard label="chats reached" value={formatCount(delivery.chatsReached)} hint={period} />
        <StatCard
          label="per chat / day"
          value={delivery.messagesPerChatPerDay.toFixed(1)}
          hint="messages"
        />
      </StatGrid>
      <div className="mt-3">
        <DataTable
          columns={COLUMNS}
          rows={delivery.daily}
          rowKey={(row) => row.date}
          minWidth={360}
        />
      </div>
    </Panel>
  );
}
