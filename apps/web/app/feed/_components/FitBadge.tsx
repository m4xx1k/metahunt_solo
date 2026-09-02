"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { FitTier } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// Tier is derived from the number, so it only colours it — the percentage is
// what the card actually claims.
const TIER: Record<FitTier, { text: string; border: string; label: string }> = {
  STRONG: { text: "text-success", border: "border-success", label: "strong" },
  GOOD: { text: "text-accent", border: "border-accent", label: "good" },
  STRETCH: { text: "text-text-muted", border: "border-text-muted", label: "stretch" },
};

// The Fit slot: the number, its tier colour, and a caller-supplied tooltip —
// the warm lens (full breakdown + diff counts) and the cold lens (MatchOverlay,
// no per-skill breakdown) each know what they can actually itemise, so neither
// is forced into the other's shape.
export function FitBadge({
  tier,
  percent,
  detail,
  tooltip,
}: {
  tier: FitTier;
  percent: number;
  /** Appended to the built-in aria-label, e.g. "2 of 3 required skills covered". */
  detail?: string;
  tooltip: ReactNode;
}) {
  const t = TIER[tier];
  const ariaLabel = `${percent}% fit — ${t.label}${detail ? `, ${detail}` : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={ariaLabel}
          className={cn(
            "inline-flex cursor-help items-baseline gap-1.5 border px-2 py-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            t.border,
          )}
        >
          <span className={cn("font-mono text-sm font-bold leading-none", t.text)}>{percent}%</span>
          <span aria-hidden className={cn("text-2xs font-bold uppercase tracking-wider", t.text)}>
            fit · {t.label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
