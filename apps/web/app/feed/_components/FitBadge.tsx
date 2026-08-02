"use client";

import { cn } from "@/lib/utils";
import type { FitTier, RankedVacancy, ScoreSignal } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// Tier is derived from the number, so it only colours it — the percentage is
// what the card actually claims.
const TIER: Record<FitTier, { text: string; border: string; label: string }> = {
  STRONG: { text: "text-success", border: "border-success", label: "strong" },
  GOOD: { text: "text-accent", border: "border-accent", label: "good" },
  STRETCH: { text: "text-text-muted", border: "border-text-muted", label: "stretch" },
};

const SIGNAL_LABEL: Record<ScoreSignal["kind"], string> = {
  "skill-overlap": "skill overlap",
};

// The warm Fit slot: the number, its tier colour, and a tooltip that itemises
// the breakdown. Rendering from `signals` means the next scoring signal shows up
// here on its own.
export function FitBadge({ item }: { item: RankedVacancy }) {
  const tier = TIER[item.fit.tier];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${item.fit.percent}% fit — ${tier.label}, ${item.fit.matchedRequired} of ${item.fit.requiredTotal} required skills covered`}
          className={cn(
            "inline-flex cursor-help items-baseline gap-1.5 border px-2 py-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            tier.border,
          )}
        >
          <span className={cn("font-mono text-sm font-bold leading-none", tier.text)}>
            {item.fit.percent}%
          </span>
          <span
            aria-hidden
            className={cn("text-2xs font-bold uppercase tracking-wider", tier.text)}
          >
            fit · {tier.label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex flex-col gap-1">
          <span className="font-bold">Fit {item.fit.percent}%</span>
          {item.breakdown.signals.map((signal) => (
            <span key={signal.kind}>
              {SIGNAL_LABEL[signal.kind]} {Math.round(signal.raw * 100)}% × weight {signal.weight}
            </span>
          ))}
          <span className="text-text-muted">
            {item.fit.matchedRequired} of {item.fit.requiredTotal} required skills, weighted by how
            rare each one is.
          </span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
