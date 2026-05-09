import type { FuzzyMatch } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<FuzzyMatch["status"], string> = {
  VERIFIED: "border-success text-success",
  NEW: "border-accent text-accent",
  REJECTED: "border-text-muted text-text-muted",
};

export function FuzzyMatchList({
  matches,
  skippedReason,
}: {
  matches: FuzzyMatch[];
  skippedReason?: string;
}) {
  if (skippedReason) {
    return (
      <div className="flex flex-col gap-1 border border-border bg-bg-elev p-3 font-mono text-xs text-text-muted">
        <span className="font-bold text-text-secondary">
          fuzzy matching skipped
        </span>
        <span>{skippedReason}</span>
      </div>
    );
  }
  if (matches.length === 0) {
    return (
      <p className="font-mono text-xs text-text-muted">
        no fuzzy candidates above threshold
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border border border-border bg-bg-elev">
      {matches.map((m) => (
        <li
          key={m.id}
          className="grid grid-cols-[1fr_80px_72px] items-center gap-3 px-3 py-2 font-mono text-xs"
        >
          <span className="truncate text-text-primary">{m.canonicalName}</span>
          <span
            className={cn(
              "border px-2 py-[1px] text-[10px] uppercase tracking-wider",
              STATUS_PILL[m.status],
            )}
          >
            {m.status}
          </span>
          <span className="text-right text-text-muted">
            sim {m.similarity.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  );
}
