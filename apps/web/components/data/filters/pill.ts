import { cn } from "@/lib/utils";

// Shared chip/pill look for the non-list filter sections (seniority,
// format, source, test, reservation). Tier-2: reused by the market feed
// filters and the reverse-ATS filter bar.
export function pillClass(active: boolean): string {
  return cn(
    "inline-flex items-center justify-center border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors",
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
  );
}

// Compact multi-select chip for dense, horizontal tag lists (skills): w-fit,
// minimal padding, no uppercase (skill names are case-sensitive — "Node.js").
export function chipClass(active: boolean): string {
  return cn(
    "inline-flex w-fit items-center border px-2 py-0.5 font-mono text-[11px] leading-5 tracking-tight transition-colors",
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
  );
}
