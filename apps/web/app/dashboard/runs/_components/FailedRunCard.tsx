import Link from "next/link";

import type { IngestListItem } from "@/lib/api/monitoring";
import { formatRelative } from "@/lib/format";

export function FailedRunCard({ run }: { run: IngestListItem }) {
  const source = run.sourceCode ?? run.sourceDisplayName ?? "source";
  return (
    <article className="flex flex-col gap-3 border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3 font-mono text-xs">
        <Link
          href={`/dashboard/runs/${run.id}`}
          className="text-accent transition-colors hover:underline"
        >
          {source} · {run.id.slice(0, 8)}…
        </Link>
        <span className="tabular-nums text-text-muted">{formatRelative(run.startedAt)}</span>
      </div>
      {run.errorMessage ? (
        <pre className="overflow-x-auto whitespace-pre-wrap border border-danger/40 bg-bg p-3 font-mono text-xs leading-relaxed text-danger">
          {run.errorMessage}
        </pre>
      ) : (
        <p className="font-mono text-xs text-text-muted">no error message recorded</p>
      )}
    </article>
  );
}
