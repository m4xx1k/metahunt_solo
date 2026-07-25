import type { ProductAnalyticsOverview } from "@/lib/api/product-analytics";
import { formatCount } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { Panel } from "@/ui/layout/Panel";

type DeliveryDay = ProductAnalyticsOverview["delivery"]["daily"][number];

type Props = {
  delivery: ProductAnalyticsOverview["delivery"];
  digestClicks: number;
  population: string;
};

// Past this, notification volume itself becomes the churn suspect — both
// observed unsubscribes landed right after a digest hour.
const PER_CHAT_PER_DAY_RISK = 2;

const DAILY_COLUMNS: Array<Column<DeliveryDay>> = [
  { key: "date", header: "day", render: (row) => row.date },
  { key: "digests", header: "digests", align: "right", render: (row) => formatCount(row.digests) },
  { key: "chats", header: "chats", align: "right", render: (row) => formatCount(row.chats) },
  { key: "perChat", header: "per chat", align: "right", render: (row) => row.perChat.toFixed(1) },
  {
    key: "failures",
    header: "failures",
    align: "right",
    render: (row) =>
      row.failures > 0 ? <span className="text-danger">{formatCount(row.failures)}</span> : "0",
  },
];

// System health: what OUR pipeline did in the period — deliberately separate
// from the funnel, which only tracks what the user did.
export function DeliveryPanel({ delivery, digestClicks, population }: Props) {
  const perChatPerDay = delivery.messagesPerChatPerDay;

  return (
    <Panel title="Delivery" meta={`${population} · system events, not user actions`}>
      <StatGrid cols={5}>
        <StatCard
          label="digests sent"
          value={formatCount(delivery.digestsSent)}
          hint={`${formatCount(delivery.chatsReached)} chats reached`}
        />
        <StatCard
          label="per chat / day"
          value={perChatPerDay.toFixed(1)}
          hint={perChatPerDay > PER_CHAT_PER_DAY_RISK ? "churn risk — cap sends" : "send volume"}
          tone={perChatPerDay > PER_CHAT_PER_DAY_RISK ? "danger" : "default"}
        />
        <StatCard
          label="digest clicks"
          value={formatCount(digestClicks)}
          hint="taps back from telegram"
          tone="accent"
        />
        <StatCard
          label="failed sends"
          value={formatCount(delivery.failures.chatUnreachable + delivery.failures.transient)}
          hint={`${formatCount(delivery.failures.chatUnreachable)} unreachable · ${formatCount(delivery.failures.transient)} transient`}
          tone={delivery.failures.chatUnreachable > 0 ? "danger" : "default"}
        />
        <StatCard
          label="unsubscribes"
          value={formatCount(delivery.unsubscribed)}
          hint="unsubscribed events in period"
          tone={delivery.unsubscribed > 0 ? "danger" : "default"}
        />
      </StatGrid>

      <div className="pt-4">
        <DataTable
          columns={DAILY_COLUMNS}
          rows={delivery.daily}
          rowKey={(row) => row.date}
          minWidth={520}
          empty="no digests in the last 7 days"
        />
      </div>
    </Panel>
  );
}
