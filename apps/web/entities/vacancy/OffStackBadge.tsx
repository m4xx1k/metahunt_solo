"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// Marks a match whose required core technology sits outside the viewer's stack
// (ADR-0010 / score.sql `on_stack`) — a Java role scored against a Python CV.
// The word is ours, not the market's, so it never appears without the tooltip
// that says what it means and why the row is still here.
export function OffStackBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label="off-stack — this role's core technology is not one of yours"
          className="cursor-help border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          off-stack
        </span>
      </TooltipTrigger>
      <TooltipContent>
        The core technology this role is built on is not one of yours — the rest of your skills
        still matched, which is why it is here at all. Ranked lists hide these by default.
      </TooltipContent>
    </Tooltip>
  );
}
