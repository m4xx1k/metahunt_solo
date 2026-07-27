import {
  EVENT_CATALOG,
  countsAsLastAction,
  type AnalyticsEventDoc,
} from "@/entities/analytics/event-catalog";
import { DataTable, type Column } from "@/ui/data/DataTable";
import { Panel } from "@/ui/layout/Panel";

const COLUMNS: Array<Column<AnalyticsEventDoc>> = [
  {
    key: "name",
    header: "event",
    render: (row) => <span className="text-text-primary">{row.name}</span>,
  },
  { key: "means", header: "means", render: (row) => row.means },
  {
    key: "actor",
    header: "who",
    render: (row) => (
      <span className={row.actor === "user" ? "text-success" : "text-text-muted"}>{row.actor}</span>
    ),
  },
  {
    key: "sink",
    header: "where",
    render: (row) =>
      row.sink === "ledger" ? (
        <span className="text-text-secondary">ledger</span>
      ) : (
        <span className="border border-danger/60 px-1.5 py-0.5 text-danger">posthog only</span>
      ),
  },
  {
    key: "lastAction",
    header: "counts as last action",
    align: "right",
    render: (row) => (countsAsLastAction(row) ? "yes" : "no"),
  },
];

// Answers "what could 'last action' have been" in one place. The posthog-only
// rows are the honest part: those events fire, but never reach Postgres, so no
// widget on this console can show them (MET-56).
export function EventsPanel() {
  const invisible = EVENT_CATALOG.filter((event) => event.sink === "posthog-only").length;

  return (
    <Panel
      title="Events"
      meta={`${EVENT_CATALOG.length} tracked`}
      footer={
        <span className="text-text-muted">
          {invisible} events reach PostHog but not the ledger — no widget here can see them.
        </span>
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={EVENT_CATALOG}
        rowKey={(row) => row.name}
        minWidth={760}
        empty="no events"
      />
    </Panel>
  );
}
