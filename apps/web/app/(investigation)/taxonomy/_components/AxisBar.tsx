import { StackedBar } from "@/components/data/StackedBar";
import type { AxisCoverage, AxisKey } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

const HEALTH_AMBER_PCT = 10;
const HEALTH_RED_PCT = 30;

const AXIS_LABEL: Record<AxisKey, string> = {
  role: "ROLE",
  skill: "SKILL",
  domain: "DOMAIN",
};

type Health = "green" | "amber" | "red";

function healthFor(missingPct: number): Health {
  if (missingPct >= HEALTH_RED_PCT) return "red";
  if (missingPct >= HEALTH_AMBER_PCT) return "amber";
  return "green";
}

const HEALTH_LABEL: Record<Health, string> = {
  green: "ok",
  amber: "watch",
  red: "drift",
};

const HEALTH_PILL: Record<Health, string> = {
  green: "border-success text-success",
  amber: "border-accent text-accent",
  red: "border-danger text-danger",
};

export function AxisBar({
  axis,
  coverage,
}: {
  axis: AxisKey;
  coverage: AxisCoverage;
}) {
  const total = coverage.total;
  const missingPct =
    total > 0 ? (coverage.missing / total) * 100 : 0;
  const health = healthFor(missingPct);

  const segments = [
    {
      value: coverage.verified,
      label: "verified",
      color: "var(--color-success)",
    },
    {
      value: coverage.new,
      label: "new",
      color: "var(--color-accent)",
    },
    {
      value: coverage.missing,
      label: "missing",
      color: "var(--color-border-strong)",
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
          {AXIS_LABEL[axis]}
        </span>
        <div className="flex items-baseline gap-3 font-mono text-xs text-text-muted">
          <span>verified · {coverage.verified}</span>
          <span>new · {coverage.new}</span>
          <span>missing · {coverage.missing}</span>
          <span
            className={cn(
              "border px-2 py-[2px] text-[10px] uppercase tracking-wider",
              HEALTH_PILL[health],
            )}
          >
            {HEALTH_LABEL[health]} · {missingPct.toFixed(0)}%
          </span>
        </div>
      </div>
      <StackedBar
        segments={segments}
        total={total}
        height={20}
        ariaLabel={`${axis} coverage`}
      />
    </div>
  );
}
