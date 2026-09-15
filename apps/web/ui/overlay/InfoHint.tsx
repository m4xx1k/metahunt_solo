import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

// The "this number needs a caveat" marker. Keeps table headers to one word by
// moving the explanation into a tooltip. `label` becomes the trigger button's
// accessible name — it must be specific to this one hint, never reused across
// several instances on the same panel (two buttons with the same aria-label
// are indistinguishable to a screen reader).
export function InfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex text-text-muted transition-colors hover:text-accent"
        >
          <Info aria-hidden="true" className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

// "short label + tooltip caveat" as one unit — the pattern every stat/panel
// hint on the analytics page was hand-rolling (and drifting: gap-1 vs
// gap-1.5, one copy that reused a single aria-label across sibling cards).
// `label` is the InfoHint's accessible name, so callers must pass one that's
// unique among sibling hints, not just descriptive of the metric.
export function HintText({
  label,
  text,
  children,
}: {
  label: string;
  text: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <InfoHint label={label}>{children}</InfoHint>
    </span>
  );
}
