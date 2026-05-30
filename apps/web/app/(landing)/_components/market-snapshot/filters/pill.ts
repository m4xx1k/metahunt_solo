import { cn } from "@/lib/utils";

// Shared chip/pill look for the non-list filter sections (seniority,
// format, source, test, reservation). Roles/skills stay as marker rows,
// so they intentionally don't use this.
export function pillClass(active: boolean): string {
  return cn(
    "inline-flex items-center justify-center border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors",
    active
      ? "border-accent bg-accent/10 text-accent"
      : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
  );
}
