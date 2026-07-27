import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// Which clock a number is on. The console has one period selector but three
// different time semantics, and reading a state number as if it moved with the
// selector is the single easiest way to misread this dashboard.
export type Scope = "period" | "all-time" | "fixed-7d";

const SCOPE_LABEL: Record<Scope, string> = {
  period: "period",
  "all-time": "all time",
  "fixed-7d": "last 7d",
};

const SCOPE_EXPLAINER: Record<Scope, string> = {
  period: "Follows the period selector above.",
  "all-time": "A state, not a flow — the period selector does not change it.",
  "fixed-7d": "Always the last 7 days, whatever the period selector says.",
};

export function ScopeChip({ scope }: { scope: Scope }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`time scope: ${SCOPE_LABEL[scope]}`}
          className="border border-border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {SCOPE_LABEL[scope]}
        </button>
      </TooltipTrigger>
      <TooltipContent>{SCOPE_EXPLAINER[scope]}</TooltipContent>
    </Tooltip>
  );
}
