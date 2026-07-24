import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatRow = {
  label: string;
  value: ReactNode;
  tone?: "default" | "danger" | "muted";
};

const VALUE_TONE = {
  default: "text-text-primary",
  danger: "text-danger",
  muted: "text-text-muted",
} as const;

// Label/value ledger used wherever the console lists flat counters
// (subscription state, identity gaps, run metadata).
export function StatRows({
  rows,
  cols = 1,
  className,
}: {
  rows: StatRow[];
  cols?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 font-mono text-xs",
        cols === 2 ? "sm:grid-cols-2" : null,
        className,
      )}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2"
        >
          <dt className="text-text-muted">{row.label}</dt>
          <dd className={cn("tabular-nums", VALUE_TONE[row.tone ?? "default"])}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
