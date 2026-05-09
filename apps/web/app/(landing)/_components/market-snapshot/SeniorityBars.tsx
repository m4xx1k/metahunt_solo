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

const SHORT: Record<Seniority, string> = {
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
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        seniority
      </span>
      {visible.length === 0 ? (
        <span className="font-mono text-xs text-text-muted">no data</span>
      ) : (
        <div className="flex flex-1 items-end justify-between gap-3">
          {visible.map((k, idx) => {
            const v = dist[k] ?? 0;
            const heightPct = max > 0 ? (v / max) * 100 : 0;
            return (
              <div
                key={k}
                className="flex flex-1 flex-col items-center gap-1.5"
                title={`${SHORT[k]}: ${v}`}
              >
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  {v}
                </span>
                <div className="flex h-14 w-full items-end">
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
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  {SHORT[k]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
