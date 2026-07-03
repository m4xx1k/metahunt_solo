"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";

// Feed-only toggle: when on, the server page passes ?dupes=true and the feed
// shows only the canonical card of collapsed gold groups (the deduped
// cross-source vacancies). Kept self-contained — writes the `dupes` URL param
// directly — so it stays out of the shared FilterState the reverse-ATS bar
// also consumes.
export function DedupeToggle() {
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();

  const on = searchParams.get("dupes") === "true";

  const toggle = useCallback(() => {
    push((next) => {
      if (on) next.delete("dupes");
      else next.set("dupes", "true");
      next.delete("offset");
    });
  }, [on, push]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={cn(
        "flex items-center justify-between gap-2 border px-3 py-2 font-mono text-2xs uppercase tracking-wider transition-colors",
        on
          ? "border-accent-secondary bg-accent-secondary/10 text-accent-secondary"
          : "border-border bg-bg-card text-text-secondary hover:text-accent-secondary",
      )}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>⧉</span>
        лише дубльовані
      </span>
      <span aria-hidden>{on ? "[on]" : "[off]"}</span>
    </button>
  );
}
