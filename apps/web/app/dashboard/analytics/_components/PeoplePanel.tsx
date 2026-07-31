import Link from "next/link";

import type {
  CrmPeoplePage,
  CrmPeopleSort,
  ProductAnalyticsPeriod,
} from "@/lib/api/product-analytics";
import { formatDateTime } from "@/lib/format";
import { DataTable } from "@/ui/data/DataTable";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";
import { UrlSearch } from "@/ui/inputs/UrlSearch";
import { Panel } from "@/ui/layout/Panel";
import { Pagination } from "@/ui/navigation/Pagination";

const SORTS: Array<{ value: CrmPeopleSort; label: string }> = [
  { value: "recent", label: "recent" },
  { value: "first_known", label: "first known" },
  { value: "clicks", label: "clicks" },
  { value: "at_risk", label: "at risk" },
];

function personLabel(id: string): string {
  return `person · ${id.slice(0, 8)}`;
}

export function PeoplePanel({
  people,
  period,
  q,
  sort,
  from,
  to,
}: {
  people: CrmPeoplePage;
  period: ProductAnalyticsPeriod;
  q: string | undefined;
  sort: CrmPeopleSort;
  from: string | undefined;
  to: string | undefined;
}) {
  const baseParams = { period, q, sort, from, to };
  return (
    <Panel title="People" meta="CRM facts · all timestamps are absolute">
      <StatGrid cols={4} className="mb-5">
        <StatCard label="known people" value={people.metrics.knownPeople} />
        <StatCard label="Telegram connected" value={people.metrics.telegramConnected} />
        <StatCard
          label="job clickers"
          value={people.metrics.jobClickers}
          hint={`selected ${period}`}
        />
        <StatCard label="at risk" value={people.metrics.atRisk} tone="danger" />
      </StatGrid>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <UrlSearch placeholder="person id…" />
        <div className="flex border border-border font-mono text-2xs">
          {SORTS.map((option) => (
            <Link
              key={option.value}
              href={`/dashboard/analytics?${new URLSearchParams({
                ...(q ? { q } : {}),
                period,
                sort: option.value,
                ...(from && to ? { from, to } : {}),
              })}`}
              className={`px-2.5 py-1.5 ${sort === option.value ? "bg-bg-elev text-accent" : "text-text-muted hover:text-text-primary"}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>
      <form action="/dashboard/analytics" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="period" value={period} />
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <input type="hidden" name="sort" value={sort} />
        <label className="flex flex-col gap-1 font-mono text-2xs text-text-muted">
          from · Europe/Kyiv
          <input
            type="datetime-local"
            name="from"
            defaultValue={from}
            required
            className="border border-border bg-bg px-2 py-1.5 text-xs text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-2xs text-text-muted">
          to · Europe/Kyiv
          <input
            type="datetime-local"
            name="to"
            defaultValue={to}
            required
            className="border border-border bg-bg px-2 py-1.5 text-xs text-text-primary"
          />
        </label>
        <button
          type="submit"
          className="border border-border bg-bg-card px-3 py-1.5 font-mono text-xs hover:text-accent"
        >
          apply range
        </button>
      </form>
      <DataTable
        minWidth={760}
        rows={people.rows}
        rowKey={(row) => row.id}
        columns={[
          {
            key: "person",
            header: "person",
            render: (row) => (
              <div>
                <p className="text-text-primary">{personLabel(row.id)}</p>
                <p className="mt-1 text-2xs text-text-muted">
                  {[row.hasAccount && "account", row.hasTelegram && "telegram"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ),
          },
          {
            key: "first",
            header: "first known",
            render: (row) => formatDateTime(row.firstKnownAt),
          },
          {
            key: "last",
            header: "last product action",
            render: (row) => formatDateTime(row.lastProductActionAt),
          },
          {
            key: "subscriptions",
            header: "subscriptions",
            align: "right",
            render: (row) => row.subscriptions,
          },
          {
            key: "clicks",
            header: "clicks",
            align: "right",
            render: (row) => `${row.feedClicks} feed · ${row.telegramClicks} TG`,
          },
          { key: "state", header: "state", render: (row) => row.state.replace("_", " ") },
        ]}
      />
      <div className="mt-4">
        <Pagination
          total={people.total}
          limit={people.limit}
          offset={people.offset}
          basePath="/dashboard/analytics"
          searchParams={baseParams}
        />
      </div>
    </Panel>
  );
}
