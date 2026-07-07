"use client";

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { SCENARIOS, tierOf, type Scenario, type Tier } from "./data";

const TIER_CLASS: Record<Tier, string> = {
  STRONG: "text-success border-success/60",
  GOOD: "text-accent-secondary border-accent-secondary/60",
  STRETCH: "text-text-muted border-border",
};

// Simple reverse-ATS read: a CV → its 3 top jobs, each with a match % + fit
// tier. The % counts up, then it cycles to the next sample CV.
export function MatchStage() {
  const [si, setSi] = useState(0);
  const onDone = useCallback(() => setSi((v) => (v + 1) % SCENARIOS.length), []);
  // Keyed remount per scenario → fresh count-up without resetting in an effect.
  return <RankedCard key={si} scenario={SCENARIOS[si]} onDone={onDone} />;
}

function RankedCard({ scenario, onDone }: { scenario: Scenario; onDone: () => void }) {
  const reduce = useReducedMotion();
  const jobs = scenario.jobs.slice(0, 3);
  const [prog, setProg] = useState(reduce ? 100 : 0); // 0..100 drives the % count-up

  useEffect(() => {
    const timers: number[] = [];
    if (!reduce) {
      const id = window.setInterval(() => setProg((p) => Math.min(100, p + 6)), 30);
      timers.push(window.setTimeout(() => window.clearInterval(id), 700));
      timers.push(window.setTimeout(onDone, 3600));
      return () => {
        window.clearInterval(id);
        timers.forEach(window.clearTimeout);
      };
    }
    timers.push(window.setTimeout(onDone, 3600));
    return () => timers.forEach(window.clearTimeout);
  }, [reduce, onDone]);

  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-4">
      <div className="flex items-center gap-2">
        <span className="border-[1.5px] border-accent-secondary/50 bg-accent-secondary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-accent-secondary">
          {scenario.cv}
        </span>
        <span className="font-mono font-bold text-border-strong">→</span>
        <span className="font-mono text-[10px] text-text-secondary">ranked to you</span>
      </div>

      <div className="flex flex-col gap-2">
        {jobs.map((job, i) => {
          const tier = tierOf(job.coverage);
          return (
            <div
              key={job.name}
              className={cn(
                "flex items-center gap-2 border-[1.5px] bg-bg-elev px-3 py-2",
                i === 0 ? "border-accent" : "border-border",
              )}
            >
              <span className="flex-1 truncate font-mono text-xs text-text-primary">
                {job.name}
              </span>
              <span className="w-9 text-right font-mono text-sm font-bold text-text-primary">
                {Math.round((job.coverage * prog) / 100)}%
              </span>
              <span
                className={cn(
                  "w-16 border-[1.5px] px-1.5 py-0.5 text-center font-mono text-[9px] font-bold",
                  TIER_CLASS[tier],
                )}
              >
                {tier}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
