import type { AtsOverview } from "@/lib/api/ats";
import { formatCount, formatPercent } from "@/lib/format";

export function AtsSummary({ overview }: { overview: AtsOverview }) {
  const { totals } = overview;
  const headline = [
    ["boards", totals.boards],
    ["jobs", totals.jobs],
    ["open", totals.openJobs],
    ["UA", totals.uaJobs],
    ["remote", totals.remoteJobs],
    ["closed", totals.closedJobs],
  ] as const;

  return (
    <section className="grid gap-3 lg:grid-cols-3" aria-label="ATS health summary">
      <div className="border border-accent bg-bg-card p-5 shadow-brut-sm lg:col-span-2">
        <p className="font-mono text-2xs uppercase tracking-wider text-accent">
          &gt; loaded ATS corpus
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {headline.map(([label, value]) => (
            <div key={label}>
              <p className="font-display text-2xl font-bold text-text-primary">
                {formatCount(value)}
              </p>
              <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-xs text-text-muted">
          {formatCount(totals.duplicateCandidates)} source postings already belong to a dedup group;
          use “needs review” to inspect missing fields first.
        </p>
      </div>

      <div className="border border-border bg-bg-card p-5">
        <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          &gt; field coverage
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {overview.fieldCoverage.map((item) => (
            <div
              key={item.field}
              className="flex items-baseline justify-between gap-3 font-mono text-xs"
            >
              <span className="text-text-secondary">{item.field}</span>
              <span className="text-text-primary">
                {formatPercent(item.filled, item.total)}{" "}
                <span className="text-text-muted">{formatCount(item.filled)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-border bg-bg-card p-5 lg:col-span-3">
        <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          &gt; boards to inspect
        </p>
        {overview.problemBoards.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-text-muted">
            No ATS boards in this database yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
            {overview.problemBoards.map((board) => (
              <div
                key={`${board.atsType}:${board.boardSlug ?? board.name}`}
                className="bg-bg-card p-3"
              >
                <p className="truncate font-body text-sm text-text-primary">{board.name}</p>
                <p className="mt-1 font-mono text-2xs uppercase text-danger">{board.issue}</p>
                <p className="mt-2 font-mono text-2xs text-text-muted">
                  {formatCount(Number(board.jobs))} jobs · loc{" "}
                  {formatPercent(Number(board.locationJobs), Number(board.jobs))} · URL{" "}
                  {formatPercent(Number(board.directUrlJobs), Number(board.jobs))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
