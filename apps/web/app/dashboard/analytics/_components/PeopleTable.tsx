import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

import type {
  AnalyticsPagePeoplePage,
  AnalyticsPagePeriod,
  AnalyticsPagePerson,
} from "@/lib/api/analytics-page";
import { formatCount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/badges/Badge";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { UrlSearch } from "@/ui/inputs/UrlSearch";
import { Panel } from "@/ui/layout/Panel";
import { Pagination } from "@/ui/navigation/Pagination";

type SortableKey = "displayName" | "registeredAt" | "subscriptions" | "firstSubscriptionAt";

function formatMinutes(value: number | null): string {
  if (value == null) return "—";
  const days = Math.floor(value / 1_440);
  const hours = Math.floor((value % 1_440) / 60);
  const minutes = value % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function personCell(row: AnalyticsPagePerson) {
  return (
    <div>
      <p className="font-medium text-text-primary">{row.displayName}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {row.telegramLinked ? <Badge>telegram</Badge> : null}
        {row.hasAccount ? <Badge variant="dark">account</Badge> : null}
        {!row.telegramLinked && !row.hasAccount ? <Badge variant="dark">anonymous</Badge> : null}
        {row.providers.map((provider) => (
          <Badge key={provider} variant="dark">
            {provider}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function PeopleTable({
  people,
  available,
  period,
  source,
  q,
  sort,
  dir,
  offset,
  limit,
}: {
  people: AnalyticsPagePeoplePage;
  available: boolean;
  period: AnalyticsPagePeriod;
  source: string | undefined;
  q: string | undefined;
  sort: string | undefined;
  dir: "asc" | "desc";
  offset: number;
  limit: number;
}) {
  const baseParams: Record<string, string | undefined> = {
    period: period !== "30d" ? period : undefined,
    source,
    q,
    sort,
    dir: sort ? dir : undefined,
  };

  function sortHref(key: SortableKey) {
    const nextDir: "asc" | "desc" = sort === key && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...baseParams, sort: key, dir: nextDir })) {
      if (v) params.set(k, v);
    }
    return `/dashboard/analytics?${params.toString()}`;
  }

  function sortableHeader(key: SortableKey, label: string) {
    const active = sort === key;
    return (
      <Link
        href={sortHref(key)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-accent",
          active && "text-text-primary",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp aria-hidden="true" className="size-3" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3" />
          )
        ) : null}
      </Link>
    );
  }

  const columns: Array<Column<AnalyticsPagePerson>> = [
    { key: "person", header: sortableHeader("displayName", "person"), render: personCell },
    {
      key: "registeredAt",
      header: sortableHeader("registeredAt", "registered"),
      render: (row) => formatDateTime(row.registeredAt),
    },
    {
      key: "subscriptions",
      header: sortableHeader("subscriptions", "subs"),
      align: "right",
      render: (row) => `${row.activeSubscriptions}/${row.subscriptions}`,
    },
    {
      key: "firstSubscriptionAt",
      header: sortableHeader("firstSubscriptionAt", "first sub"),
      render: (row) => formatDateTime(row.firstSubscriptionAt),
    },
  ];

  if (available) {
    columns.push(
      {
        key: "firstEventAt",
        header: "first seen",
        render: (row) => formatDateTime(row.firstEventAt),
      },
      {
        key: "lastEventAt",
        header: "last seen",
        render: (row) => formatDateTime(row.lastEventAt),
      },
      {
        key: "pageviews",
        header: "pageviews",
        align: "right",
        render: (row) => (row.pageviews == null ? "—" : formatCount(row.pageviews)),
      },
      {
        key: "clicks",
        header: "clicks",
        align: "right",
        render: (row) => (
          <div className="flex justify-end gap-1.5">
            <Badge variant="dark">feed {row.feedClicks ?? "—"}</Badge>
            <Badge>digest {row.digestClicks ?? "—"}</Badge>
          </div>
        ),
      },
      {
        key: "minutesToRegistration",
        header: "→ registered",
        align: "right",
        render: (row) => formatMinutes(row.minutesToRegistration),
      },
      {
        key: "minutesToSubscription",
        header: "→ subscribed",
        align: "right",
        render: (row) => formatMinutes(row.minutesToSubscription),
      },
    );
  }

  return (
    <Panel
      title="People"
      meta="one row = one person"
      footer={
        <span className="text-text-muted">
          A Telegram-only subscriber who never opened the web app may show as more than one row
          (person ids aren&apos;t merged yet — MET-115).
        </span>
      }
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <UrlSearch placeholder="name, email, or ID…" />
        {!available ? (
          <span className="font-mono text-2xs text-text-muted">
            PostHog columns hidden — personal API key not configured
          </span>
        ) : null}
      </div>
      <DataTable
        minWidth={available ? 1180 : 760}
        rows={people.rows}
        rowKey={(row) => row.personId}
        columns={columns}
      />
      <div className="mt-4">
        <Pagination
          total={people.total}
          limit={limit}
          offset={offset}
          basePath="/dashboard/analytics"
          searchParams={baseParams}
        />
      </div>
    </Panel>
  );
}
