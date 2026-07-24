import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type MeterTone = "accent" | "neutral" | "danger" | "success";

const BAR_TONE: Record<MeterTone, string> = {
  accent: "bg-accent",
  neutral: "bg-text-secondary",
  danger: "bg-danger",
  success: "bg-success",
};

// One labelled progress row: funnel steps, taxonomy coverage, dedupe buckets
// and cost-by-model all render as a stack of these.
export function MeterRow({
  label,
  value,
  pct,
  note,
  tone = "accent",
}: {
  label: ReactNode;
  value: ReactNode;
  pct: number;
  note?: ReactNode;
  tone?: MeterTone;
}) {
  const width = Math.min(Math.max(pct, 1.5), 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 font-mono text-xs">
        <span className="min-w-0 truncate text-text-secondary">{label}</span>
        <span className="shrink-0 tabular-nums text-text-primary">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-bg-elev" aria-hidden="true">
        <div className={cn("h-full", BAR_TONE[tone])} style={{ width: `${width}%` }} />
      </div>
      {note ? <span className="font-mono text-2xs text-text-muted">{note}</span> : null}
    </div>
  );
}
