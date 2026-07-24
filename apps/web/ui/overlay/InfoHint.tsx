import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";

// The "this number needs a caveat" marker. Keeps table headers to one word by
// moving the explanation into a tooltip.
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
