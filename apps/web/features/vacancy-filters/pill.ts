import { cn } from "@/lib/utils";

// Shared chip/pill look for the non-list filter sections (seniority,
// format, source, test, reservation). Geometry matches the card's badges
// (SeniorityBadge / FlagPill) so a "remote" pill in the filter and a "remote"
// eyebrow on a card read as the same object. Tier-2: reused by the market feed
// filters and the reverse-ATS filter bar.
export const PILL_BASE =
  "inline-flex items-center justify-center border px-2.5 py-1 font-mono text-2xs uppercase tracking-wider transition-colors";

export function pillClass(active: boolean): string {
  return cn(
    PILL_BASE,
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
  );
}

// Compact multi-select chip for dense, horizontal tag lists (skills): w-fit,
// minimal padding, no uppercase (skill names are case-sensitive — "Node.js").
// Matches SkillChip's geometry/tone (selected = required = accent).
export function chipClass(active: boolean): string {
  return cn(
    "inline-flex w-fit items-center border px-2 py-[2px] font-mono text-xs transition-colors",
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
  );
}
