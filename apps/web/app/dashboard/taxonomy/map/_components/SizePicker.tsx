"use client";

import { cn } from "@/lib/utils";
import { useUrlState } from "../../_hooks/use-url-state";
import { MAP_SIZES, type MapSize } from "../_lib/map-page-state";

export function SizePicker({ size }: { size: MapSize }) {
  const { update } = useUrlState();
  const handlePick = (n: MapSize) => () => update({ size: String(n) });

  return (
    <div className="flex flex-wrap items-center gap-2 border border-border bg-bg-card p-3">
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">size</span>
      {MAP_SIZES.map((n) => (
        <button
          key={n}
          type="button"
          onClick={handlePick(n)}
          className={cn(
            "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors sm:px-2 sm:py-1",
            size === n
              ? "border-accent text-accent"
              : "border-border text-text-muted hover:text-text-secondary",
          )}
        >
          top {n}
        </button>
      ))}
    </div>
  );
}
