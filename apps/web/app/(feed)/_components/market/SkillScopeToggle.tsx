"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";

// Feed-only toggle that widens skill matching. Off (default): a selected skill
// must be must-have on the vacancy. On: the server page passes
// ?nice=true → includeOptionalSkills, so nice-to-have skills also match.
// Self-contained (writes the `nice` URL param directly) so it stays out of the
// shared FilterState the warm-lens filter bar also consumes — same pattern as
// DedupeToggle.
export function SkillScopeToggle() {
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();

  const on = searchParams.get("nice") === "true";

  const toggle = useCallback(() => {
    push((next) => {
      if (on) next.delete("nice");
      else next.set("nice", "true");
      next.delete("offset");
    });
  }, [on, push]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 border px-2 py-[2px] font-mono text-2xs uppercase tracking-wide transition-colors",
        on
          ? "border-accent-secondary bg-accent-secondary/10 text-accent-secondary"
          : "border-border text-text-muted hover:border-text-secondary hover:text-accent-secondary",
      )}
    >
      <span aria-hidden>{on ? "☑" : "☐"}</span>
      <span>nice-to-have</span>
    </button>
  );
}
