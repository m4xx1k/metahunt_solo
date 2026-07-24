import type { SubscriberActivity } from "@/lib/api/product-analytics";
import { formatCount, formatRelative } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { Panel } from "@/ui/layout/Panel";
import { InfoHint } from "@/ui/overlay/InfoHint";
import { SubscriberIdentity } from "./SubscriberIdentity";
import { SubscriptionsPopover } from "./SubscriptionsPopover";

function stamp(iso: string | null) {
  return (
    <span className={iso ? "text-success" : "text-text-muted"}>
      {iso ? formatRelative(iso) : "—"}
    </span>
  );
}

const COLUMNS: Array<Column<SubscriberActivity>> = [
  {
    key: "subscriber",
    header: "subscriber",
    render: (row) => (
      <SubscriberIdentity
        tgUsername={row.tgUsername}
        tgFirstName={row.tgFirstName}
        chatId={row.chatId}
      />
    ),
  },
  {
    key: "joined",
    header: "joined",
    render: (row) => <span className="text-text-primary">{formatRelative(row.joinedAt)}</span>,
  },
  {
    key: "firstSeen",
    header: (
      <span className="inline-flex items-center gap-1.5">
        first event
        <InfoHint label="what first event means">
          The event log only exists since analytics shipped. For older subscriptions this is not the
          first touch — only the first recorded one. Use “joined” for the honest date.
        </InfoHint>
      </span>
    ),
    render: (row) => stamp(row.firstSeenAt),
  },
  { key: "cta", header: "cta", render: (row) => stamp(row.ctaClickedAt) },
  { key: "telegram", header: "telegram", render: (row) => stamp(row.telegramLinkedAt) },
  {
    key: "subs",
    header: "subs",
    render: (row) => <SubscriptionsPopover subscriptions={row.subscriptions} />,
  },
  {
    key: "digestClicks",
    header: "digest clicks",
    align: "right",
    render: (row) => formatCount(row.vacancyClicks),
  },
  {
    key: "feedClicks",
    header: (
      <span className="inline-flex items-center gap-1.5">
        feed clicks
        <InfoHint label="what feed clicks mean">
          Job clicks in the web feed (apply_clicked), separate from Telegram digest clicks. Counted
          only when a journey has exactly one subscription — otherwise the click can’t be
          attributed.
        </InfoHint>
      </span>
    ),
    align: "right",
    render: (row) => formatCount(row.feedClicks),
  },
];

export function SubscribersPanel({ subscribers }: { subscribers: SubscriberActivity[] }) {
  return (
    <Panel title="Subscribers" meta={`${subscribers.length} tracked`}>
      <DataTable
        columns={COLUMNS}
        rows={subscribers}
        rowKey={(row) => row.chatId}
        minWidth={1040}
        empty="no subscribers in this period"
      />
    </Panel>
  );
}
