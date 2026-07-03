"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Collapsible section primitive used by every filter group. Collapsible on all
// viewports; a single rotating chevron prefix (▾ open / ▸ closed) is the marker
// — it replaces the old `>` so the header shows one symbol, not two. Open by
// default → SSR renders full content, no-JS users see everything.

export function CollapsibleSection({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-baseline gap-2 font-mono text-2xs uppercase tracking-wider">
          <span aria-hidden className="text-text-muted">{open ? "⌄" : ">"}</span>
          <span className="font-bold text-text-primary">{title}</span>
        </span>
        <span className="truncate font-mono text-2xs text-text-secondary">
          {summary}
        </span>
      </button>
      <div className={cn(open ? "block" : "hidden")}>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
