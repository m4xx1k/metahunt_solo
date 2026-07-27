import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";
import { cn } from "@/lib/utils";

// Below this a single person swings the percentage by more than 10 points, so
// the cell is marked rather than presented as a rate.
const LOW_CONFIDENCE_SIZE = 10;

export type CohortRow = {
  label: string;
  size: number;
  returned: number[];
};

// Generic retention matrix: one row per cohort, one column per window offset.
// Every cell carries its own denominator — a percentage over a handful of
// people is a story about one person, and the grid has to say so.
export function CohortGrid({
  rows,
  columns,
  ariaLabel,
}: {
  rows: CohortRow[];
  columns: number;
  ariaLabel: string;
}) {
  const offsets = Array.from({ length: columns }, (_, index) => index);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse font-mono text-xs">
        <caption className="sr-only">{ariaLabel}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="px-2 py-1.5 text-left font-normal uppercase tracking-[0.12em] text-text-muted"
            >
              cohort
            </th>
            {offsets.map((offset) => (
              <th
                key={offset}
                scope="col"
                className="px-2 py-1.5 text-right font-normal uppercase tracking-[0.12em] text-text-muted"
              >
                w{offset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border/60">
              <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-normal">
                <span className="text-text-secondary">{row.label}</span>
                <span className="pl-2 text-text-muted">n={row.size}</span>
              </th>
              {offsets.map((offset) => (
                <Cell
                  key={offset}
                  returned={row.returned[offset] ?? 0}
                  size={row.size}
                  reachable={offset < row.returned.length}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  returned,
  size,
  reachable,
}: {
  returned: number;
  size: number;
  reachable: boolean;
}) {
  if (!reachable || size === 0) {
    return <td className="px-2 py-2 text-right text-text-muted">·</td>;
  }

  const pct = Math.round((returned / size) * 100);
  const lowConfidence = size < LOW_CONFIDENCE_SIZE;
  const swing = Math.round(100 / size);

  return (
    <td className="px-2 py-2 text-right align-middle">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${returned} of ${size} returned`}
            className={cn(
              "inline-flex flex-col items-end tabular-nums transition-colors hover:text-accent",
              pct === 0 ? "text-text-muted" : "text-text-primary",
              lowConfidence && "underline decoration-dotted decoration-1 underline-offset-4",
            )}
            style={
              pct > 0
                ? {
                    color: `color-mix(in srgb, var(--color-accent) ${Math.max(pct, 25)}%, var(--color-text-primary))`,
                  }
                : undefined
            }
          >
            <span>{pct}%</span>
            <span className="text-2xs text-text-muted">
              {returned}/{size}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {returned} of {size} came back.
          {lowConfidence ? ` One person moves this ${swing} points — read it as a count.` : ""}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}
