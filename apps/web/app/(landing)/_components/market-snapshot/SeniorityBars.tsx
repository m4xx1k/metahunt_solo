"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { Seniority } from "@/lib/api/vacancies";

type Props = {
  dist: Record<Seniority, number>;
};

const ORDER: Seniority[] = [
  "INTERN",
  "JUNIOR",
  "MIDDLE",
  "SENIOR",
  "LEAD",
  "PRINCIPAL",
  "C_LEVEL",
];

// Keep short, screen-friendly aliases for the two longest labels so all
// seven buckets fit on one row at the col-2 tile width. The full name
// stays available on hover via the FULL map.
const SHORT: Record<Seniority, string> = {
  INTERN: "intern",
  JUNIOR: "junior",
  MIDDLE: "middle",
  SENIOR: "senior",
  LEAD: "lead",
  PRINCIPAL: "princ",
  C_LEVEL: "c-lvl",
};

const FULL: Record<Seniority, string> = {
  INTERN: "intern",
  JUNIOR: "junior",
  MIDDLE: "middle",
  SENIOR: "senior",
  LEAD: "lead",
  PRINCIPAL: "principal",
  C_LEVEL: "c-level",
};

export function SeniorityBars({ dist }: Props) {
  const reduced = useReducedMotion();
  const visible = ORDER.filter((k) => (dist[k] ?? 0) > 0);
  const max = Math.max(0, ...visible.map((k) => dist[k] ?? 0));

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-card p-4">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        seniority
      </span>
      {visible.length === 0 ? (
        <span className="font-mono text-xs text-text-muted">no data</span>
      ) : (
        <div className="flex items-end justify-between gap-2">
          {visible.map((k, idx) => {
            const v = dist[k] ?? 0;
            const heightPct = max > 0 ? (v / max) * 100 : 0;
            return (
              <div
                key={k}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${FULL[k]}: ${v}`}
              >
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  {v}
                </span>
                <div className="flex h-10 w-full items-end">
                  <motion.div
                    className="w-full rounded-t bg-accent"
                    initial={
                      reduced
                        ? { height: `${heightPct}%` }
                        : { height: 0 }
                    }
                    whileInView={{ height: `${heightPct}%` }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{
                      duration: reduced ? 0 : 0.6,
                      ease: "easeOut",
                      delay: reduced ? 0 : idx * 0.04,
                    }}
                    style={{ minHeight: 2 }}
                  />
                </div>
                <span className="w-full truncate text-center font-mono text-[9px] uppercase tracking-wide text-text-muted">
                  {SHORT[k]}
                </span>
              </div>
            );
          })}
          <div
                
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
                title={`${FULL['C_LEVEL']}: C_LEVEL`}
              >
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  123
                </span>
                <div className="flex h-10 w-full items-end">
                  <motion.div
                    className="w-full rounded-t bg-accent"
                    initial={
                      reduced
                        ? { height: `${45}%` }
                        : { height: 0 }
                    }
                    whileInView={{ height: `${45}%` }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{
                      duration: reduced ? 0 : 0.6,
                      ease: "easeOut",
                      delay: reduced ? 0 : 6 * 0.04,
                    }}
                    style={{ minHeight: 2 }}
                  />
                </div>
                <span className="w-full truncate text-center font-mono text-[9px] uppercase tracking-wide text-text-muted">
                  {SHORT['C_LEVEL']}
                </span>
              </div>
        </div>
      )}
    </div>
  );
}
