import Link from "next/link";

import type { IngestListItem } from "@/lib/api/monitoring";
import { formatCount, formatRelative } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

// One ingest run as a list row — shared by the overview widget and the Runs
// screen, so both stay in sync on what a run looks like.
export function RunRow({ run }: { run: IngestListItem }) {
  const source = run.sourceCode ?? run.sourceDisplayName ?? "source";
  return (
    <li>
      <Link
        href={`/dashboard/runs/${run.id}`}
        className="grid grid-cols-[88px_1fr_auto] items-baseline gap-3 px-4 py-2.5 font-mono text-xs transition-colors hover:bg-bg-elev md:grid-cols-[88px_120px_1fr_auto]"
      >
        <StatusBadge status={run.status} />
        <span className="truncate text-text-primary">{source}</span>
        <span className="hidden truncate text-text-muted md:block">
          {run.status === "failed" && run.errorMessage
            ? run.errorMessage
            : `${formatCount(run.recordCount)} records`}
        </span>
        <span className="text-right tabular-nums text-text-muted">
          {formatRelative(run.startedAt)}
        </span>
      </Link>
    </li>
  );
}

export function RunList({ runs }: { runs: IngestListItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </ul>
  );
}
