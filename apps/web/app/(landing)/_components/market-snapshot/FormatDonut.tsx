"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { WorkFormat } from "@/lib/api/vacancies";

type Props = {
  dist: Record<WorkFormat, number>;
};

const FMT_LABEL: Record<WorkFormat, string> = {
  REMOTE: "remote",
  HYBRID: "hybrid",
  OFFICE: "office",
};

const SIZE = 120;
const THICKNESS = 14;

function DonutArc({ pct, label }: { pct: number; label: string }) {
  const reduced = useReducedMotion();
  const r = (SIZE - THICKNESS) / 2;
  const c = SIZE / 2;
  const circumference = 2 * Math.PI * r;
  const finalOffset = circumference - pct * circumference;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={THICKNESS}
      />
      <motion.circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={THICKNESS}
        strokeDasharray={circumference}
        strokeLinecap="butt"
        transform={`rotate(-90 ${c} ${c})`}
        initial={
          reduced
            ? { strokeDashoffset: finalOffset }
            : { strokeDashoffset: circumference }
        }
        whileInView={{ strokeDashoffset: finalOffset }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: reduced ? 0 : 0.7, ease: "easeOut" }}
      />
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
        {label}
      </text>
    </svg>
  );
}

export function FormatDonut({ dist }: Props) {
  const total = dist.REMOTE + dist.HYBRID + dist.OFFICE;
  const remoteShare = total > 0 ? Math.round((dist.REMOTE / total) * 100) : 0;
  const remotePct = total > 0 ? dist.REMOTE / total : 0;

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        format
      </span>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <DonutArc pct={remotePct} label={`${remoteShare}%`} />
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
    </div>
  );
}
