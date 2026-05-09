import { Donut } from "@/components/data/Donut";
import { formatPercent } from "@/lib/format";

export function VerifiedDonut({
  fullyVerified,
  total,
}: {
  fullyVerified: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-5 border border-border bg-bg-elev p-5">
      <Donut
        value={fullyVerified}
        total={total}
        label={formatPercent(fullyVerified, total)}
        size={104}
        thickness={14}
        ariaLabel="fully-verified vacancies"
      />
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          fully verified
        </span>
        <span className="font-display text-2xl font-bold text-text-primary">
          {fullyVerified} <span className="text-text-muted">/ {total}</span>
        </span>
        <span className="font-mono text-xs text-text-secondary">
          vacancies with role + skills + domain VERIFIED
        </span>
      </div>
    </div>
  );
}
