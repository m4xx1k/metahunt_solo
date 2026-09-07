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
//
// `kind` is a style hint only — it never changes chip order (that stays
// df-sorted in the caller) — CONCEPT nodes (practices/architectural styles,
// e.g. "RAG", "CI/CD") get the same blue used for them on the taxonomy map
// (`accent-secondary`), so they read as "not a tool" without disappearing
// below rarer TECH chips.
export function chipClass(active: boolean, kind?: "TECH" | "CONCEPT" | "SOFT" | null): string {
  const base =
    "inline-flex w-fit items-center border px-2 py-[2px] font-mono text-xs transition-colors";
  if (kind === "CONCEPT") {
    return cn(
      base,
      active
        ? "border-accent-secondary bg-accent-secondary/10 text-accent-secondary"
        : "border-accent-secondary/40 text-accent-secondary/80 hover:border-accent-secondary hover:text-accent-secondary",
    );
  }
  return cn(
    base,
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
  );
}
