import type { ProductAnalyticsOverview } from "@/lib/api/product-analytics";
import { formatCount, formatRelative } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { Panel } from "@/ui/layout/Panel";
import { JourneyActions } from "./JourneyActions";

type Journey = ProductAnalyticsOverview["recentJourneys"][number];

const COLUMNS: Array<Column<Journey>> = [
  {
    key: "id",
    header: "journey",
    render: (row) => (
      <span className="text-text-primary" title={row.id}>
        {row.id.slice(0, 8)}…
      </span>
    ),
  },
  { key: "origin", header: "origin", render: (row) => row.origin },
  {
    key: "population",
    header: "population",
    render: (row) => (
      <span className={row.isTest ? "text-accent" : "text-success"}>
        {row.isTest ? "test" : "prod"}
      </span>
    ),
  },
  { key: "cohort", header: "cohort", render: (row) => row.cohortId ?? "—" },
  { key: "subs", header: "subs", align: "right", render: (row) => row.subscriptions },
  { key: "linked", header: "linked", align: "right", render: (row) => row.linkedSubscriptions },
  {
    key: "delivered",
    header: "delivered",
    align: "right",
    render: (row) => row.deliveredSubscriptions,
  },
  {
    key: "events",
    header: "events",
    align: "right",
    render: (row) => <span title={row.eventNames.join(", ")}>{formatCount(row.events)}</span>,
  },
  {
    key: "lastSignal",
    header: "last signal",
    align: "right",
    render: (row) => formatRelative(row.lastEventAt ?? row.lastSeenAt),
  },
  {
    key: "actions",
    header: "",
    align: "right",
    render: (row) => (
      <JourneyActions journey={{ id: row.id, isTest: row.isTest, cohortId: row.cohortId }} />
    ),
  },
];

export function JourneysPanel({
  journeys,
  generatedAt,
}: {
  journeys: Journey[];
  generatedAt: string;
}) {
  return (
    <Panel title="Journeys" meta={`updated ${formatRelative(generatedAt)}`}>
      <DataTable
        columns={COLUMNS}
        rows={journeys}
        rowKey={(row) => row.id}
        minWidth={1040}
        empty="no journeys in this period"
      />
    </Panel>
  );
}
