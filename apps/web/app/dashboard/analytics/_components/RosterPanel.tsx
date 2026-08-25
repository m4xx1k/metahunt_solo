"use client";

import { useMemo, useState } from "react";

import type { SubscriberActivity } from "@/lib/api/product-analytics";
import { LastAction } from "@/entities/subscriber/LastAction";
import { SubscriberIdentity } from "@/entities/subscriber/SubscriberIdentity";
import { SubscriberStatusBadge } from "@/entities/subscriber/SubscriberStatusBadge";
import { formatCount, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";

type SortKey = "lastAction" | "joined" | "clicks";

const SORT_VALUE: Record<SortKey, (row: SubscriberActivity) => number> = {
  // null last actions sort as "oldest" so silent subscribers sink on desc.
  lastAction: (row) => (row.lastActionAt ? new Date(row.lastActionAt).getTime() : 0),
  joined: (row) => new Date(row.joinedAt).getTime(),
  clicks: (row) => row.feedClicks + row.vacancyClicks,
};

function SortHeader({
  label,
  active,
  descending,
  onClick,
}: {
  label: string;
  active: boolean;
  descending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-[0.12em]",
        active ? "text-text-primary" : "text-text-muted hover:text-text-secondary",
      )}
    >
      {label}
      <span aria-hidden="true">{active ? (descending ? "↓" : "↑") : "·"}</span>
    </button>
  );
}

// Who is actually here, one row per Telegram chat. A subscriber is in the window
// if they joined in it or did something in it — so an old subscriber who clicked
// today still shows on 24h.
export function RosterPanel({
  subscribers,
  period,
}: {
  subscribers: SubscriberActivity[];
  period: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lastAction");
  const [descending, setDescending] = useState(true);

  const handleSortToggle = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((current) => !current);
      return;
    }
    setSortKey(key);
    setDescending(true);
  };

  const rows = useMemo(() => {
    const value = SORT_VALUE[sortKey];
    const direction = descending ? -1 : 1;
    return [...subscribers].sort((a, b) => direction * (value(a) - value(b)));
  }, [subscribers, sortKey, descending]);

  const sortHeader = (key: SortKey, label: string) => (
    <SortHeader
      label={label}
      active={sortKey === key}
      descending={descending}
      onClick={() => handleSortToggle(key)}
    />
  );

  const columns: Array<Column<SubscriberActivity>> = [
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
          <SubscriberStatusBadge status={row.status} />
        </span>
      ),
    },
    {
      key: "source",
      header: "from",
      render: (row) => (
        <span className={row.source && row.source !== "direct" ? "text-accent" : "text-text-muted"}>
          {row.source ?? "—"}
        </span>
      ),
    },
    {
      key: "joined",
      header: sortHeader("joined", "joined"),
      render: (row) => <span className="font-mono">{formatDateOnly(row.joinedAt)}</span>,
    },
    {
      key: "clicks",
      header: sortHeader("clicks", "clicks"),
      align: "right",
      render: (row) => (
        <span className="font-mono">
          {formatCount(row.feedClicks)}
          <span className="text-text-muted"> feed · </span>
          {formatCount(row.vacancyClicks)}
          <span className="text-text-muted"> digest</span>
        </span>
      ),
    },
    {
      key: "lastAction",
      header: sortHeader("lastAction", "last action"),
      render: (row) => <LastAction at={row.lastActionAt} />,
    },
  ];

  return (
    <Panel
      title="Subscribers"
      meta={`${subscribers.length} active or joined · ${period}`}
      scope="period"
    >
      {subscribers.length === 0 ? (
        <EmptyState
          title="nobody in this window"
          hint="no subscriber joined or acted here — widen the period."
        />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.chatId} minWidth={640} />
      )}
    </Panel>
  );
}
