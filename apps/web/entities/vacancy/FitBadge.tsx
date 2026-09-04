"use client";

import { cn } from "@/lib/utils";
import type { FitTier } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// Tier is derived from the number, so it only colours it — the percentage is
// what the card actually claims. The hint frames the % as importance-weighted
// coverage, not a raw skill count (the diff counts next to it are the raw one).
const TIER: Record<FitTier, { text: string; border: string; label: string; hint: string }> = {
  STRONG: {
    text: "text-success",
    border: "border-success",
    label: "strong",
    hint: "You have the skills that carry the most weight for this role.",
  },
  GOOD: {
    text: "text-accent",
    border: "border-accent",
    label: "good",
    hint: "You have many of the skills this role leans on most.",
  },
  STRETCH: {
    text: "text-text-muted",
    border: "border-text-muted",
    label: "stretch",
    hint: "Several of the more important skills for this role are missing.",
  },
};

// The Fit slot: the number, its tier colour, and a tooltip that explains what
// the number means (not what it says). `detail` is the concrete count the
// weighted % is built from, e.g. "2 of 3 required skills".
export function FitBadge({
  tier,
  percent,
  detail,
}: {
  tier: FitTier;
  percent: number;
  detail?: string;
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
      <TooltipContent>
        {detail ? <span className="mb-1 block font-bold text-text-primary">{detail}</span> : null}
        <span className="block">{t.hint}</span>
      </TooltipContent>
    </Tooltip>
  );
}
