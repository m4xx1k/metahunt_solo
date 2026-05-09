import { Donut } from "@/components/data/Donut";
import type { WorkFormat } from "@/lib/api/vacancies";

type Props = {
  dist: Record<WorkFormat, number>;
  reservationKnownCount: number;
  reservationTrueCount: number;
};

const FMT_LABEL: Record<WorkFormat, string> = {
  REMOTE: "remote",
  HYBRID: "hybrid",
  OFFICE: "office",
};

export function FormatDonut({
  dist,
  reservationKnownCount,
  reservationTrueCount,
}: Props) {
  const total = dist.REMOTE + dist.HYBRID + dist.OFFICE;
  const remoteShare = total > 0 ? Math.round((dist.REMOTE / total) * 100) : 0;
  const reservationShare =
    reservationKnownCount > 0
      ? Math.round((reservationTrueCount / reservationKnownCount) * 100)
      : null;

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        format
      </span>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Donut
          value={dist.REMOTE}
          total={total}
          label={`${remoteShare}%`}
          size={120}
          thickness={14}
          ariaLabel={`${remoteShare}% remote`}
        />
        <span className="font-body text-sm text-text-secondary">remote</span>
      </div>
      <ul className="flex flex-col gap-1 font-mono text-xs text-text-muted">
        {(["REMOTE", "HYBRID", "OFFICE"] as WorkFormat[]).map((k) => {
          const pct = total > 0 ? Math.round((dist[k] / total) * 100) : 0;
          return (
            <li key={k} className="flex items-center justify-between">
              <span className="lowercase">{FMT_LABEL[k]}</span>
              <span className="tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
      {reservationShare !== null && (
        <div className="border-t border-border pt-3">
          <span className="font-body text-sm text-text-primary">
            <span className="font-display font-bold">{reservationShare}%</span>
            {" "}з бронюванням
          </span>
        </div>
      )}
    </div>
  );
}
