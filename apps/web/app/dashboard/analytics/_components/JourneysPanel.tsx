import type { ProductAnalyticsOverview } from "@/lib/api/product-analytics";
import { eventLabel } from "@/entities/analytics/event-labels";
import { formatCount, formatRelative } from "@/lib/format";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { Panel } from "@/ui/layout/Panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";
import { JourneyActions } from "./JourneyActions";

type Journey = ProductAnalyticsOverview["recentJourneys"][number];

const COLUMNS: Array<Column<Journey>> = [
  {
    key: "id",
    header: "journey",
    render: (row) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-text-primary hover:text-accent">
            {row.id.slice(0, 8)}…
          </button>
        </TooltipTrigger>
        <TooltipContent>{row.id}</TooltipContent>
      </Tooltip>
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
    render: (row) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="tabular-nums hover:text-accent">
            {formatCount(row.events)}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {row.eventNames.map((name) => eventLabel(name)).join(", ") || "no events"}
        </TooltipContent>
      </Tooltip>
    ),
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
    <Panel title="Journeys" meta={`updated ${formatRelative(generatedAt)}`} scope="period">
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
