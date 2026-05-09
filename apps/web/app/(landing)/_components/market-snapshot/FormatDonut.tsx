"use client";

import type { WorkFormat } from "@/lib/api/vacancies";

type Props = {
  dist: Record<WorkFormat, number>;
  /** Numerator: vacancies where has_reservation = true. */
  reservationTrueCount: number;
  /** Denominator: all eligible vacancies (matches list/total). */
  total: number;
};

const FMT_LABEL: Record<WorkFormat, string> = {
  REMOTE: "remote",
  HYBRID: "hybrid",
  OFFICE: "office",
};

// Each segment maps to a CSS variable so it lifts the project palette
// rather than hard-coding hex.
const FMT_STROKE: Record<WorkFormat, string> = {
  REMOTE: "var(--color-accent)",
  HYBRID: "var(--color-text-secondary)",
  OFFICE: "var(--color-text-muted)",
};

const SIZE = 120;
const THICKNESS = 14;

function MultiArcDonut({
  dist,
  formatTotal,
  centerLabel,
}: {
  dist: Record<WorkFormat, number>;
  formatTotal: number;
  centerLabel: string;
}) {
  const r = (SIZE - THICKNESS) / 2;
  const c = SIZE / 2;
  const C = 2 * Math.PI * r;

  let cumulative = 0;
  const segments: Array<{ key: WorkFormat; len: number; offset: number }> = [];
  (["REMOTE", "HYBRID", "OFFICE"] as WorkFormat[]).forEach((k) => {
    const pct = formatTotal > 0 ? dist[k] / formatTotal : 0;
    const len = pct * C;
    if (len > 0) {
      segments.push({ key: k, len, offset: -cumulative });
    }
    cumulative += len;
  });

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={centerLabel}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={THICKNESS}
      />
      {segments.map((seg) => (
        <circle
          key={seg.key}
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={FMT_STROKE[seg.key]}
          strokeWidth={THICKNESS}
          strokeDasharray={`${seg.len} ${C - seg.len}`}
          strokeDashoffset={seg.offset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${c} ${c})`}
        />
      ))}
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={SIZE * 0.22}
        fontFamily="var(--font-display)"
        fontWeight={700}
        fill="var(--color-text-primary)"
      >
        {centerLabel}
      </text>
    </svg>
  );
}

export function FormatDonut({
  dist,
  reservationTrueCount,
  total,
}: Props) {
  const formatTotal = dist.REMOTE + dist.HYBRID + dist.OFFICE;
  const remoteShare =
    formatTotal > 0 ? Math.round((dist.REMOTE / formatTotal) * 100) : 0;
  const reservationShare =
    total > 0 ? Math.round((reservationTrueCount / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        format
      </span>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <MultiArcDonut
          dist={dist}
          formatTotal={formatTotal}
          centerLabel={`${remoteShare}%`}
        />
        <span className="font-body text-sm text-text-secondary">remote</span>
      </div>
      <ul className="flex flex-col gap-1 font-mono text-xs text-text-muted">
        {(["REMOTE", "HYBRID", "OFFICE"] as WorkFormat[]).map((k) => {
          const pct =
            formatTotal > 0 ? Math.round((dist[k] / formatTotal) * 100) : 0;
          return (
            <li key={k} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 lowercase">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: FMT_STROKE[k] }}
                />
                {FMT_LABEL[k]}
              </span>
              <span className="tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2">
        <span aria-hidden className="text-base leading-none">
          🛡
        </span>
        <span className="font-display text-2xl font-bold leading-none text-success">
          {reservationShare}%
        </span>
        <span className="font-body text-sm text-text-secondary">
          з бронюванням
        </span>
      </div>
    </div>
  );
}
