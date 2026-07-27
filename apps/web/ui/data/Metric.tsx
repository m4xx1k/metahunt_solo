import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Tier-1 number: the one or two figures on a screen that should decide what you
// do next. Deliberately larger than StatCard so a page has a scan order instead
// of ten equally loud tiles. `of` renders the denominator, because a percentage
// without its sample size is how a 19-person dataset starts lying.
export function Metric({
  label,
  value,
  of,
  delta,
  note,
  children,
}: {
  label: string;
  value: ReactNode;
  of?: string;
  delta?: { value: number; suffix?: string };
  note?: ReactNode;
  children?: ReactNode;
}) {
  const trend = delta ? deltaTone(delta.value) : null;

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-5xl font-bold leading-none tabular-nums text-text-primary">
          {value}
        </span>
        {of ? <span className="font-mono text-sm text-text-muted">{of}</span> : null}
        {delta && trend ? (
          <span className={cn("font-mono text-sm tabular-nums", trend.className)}>
            {trend.sign}
            {Math.abs(delta.value)}
            {delta.suffix ?? ""}
          </span>
        ) : null}
      </div>
      {children}
      {note ? <span className="font-mono text-2xs text-text-muted">{note}</span> : null}
    </div>
  );
}

function deltaTone(value: number) {
  if (value > 0) return { sign: "+", className: "text-success" };
  if (value < 0) return { sign: "−", className: "text-danger" };
  return { sign: "±", className: "text-text-muted" };
}
