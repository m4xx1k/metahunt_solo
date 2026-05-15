"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Collapsible section primitive used by every filter group.
//
// On desktop (md+) the content is forced visible via `md:block`, the
// chevron is hidden, and the header button is inert. On mobile the
// header toggles `open` and acts as a real accordion control. Open-by-
// default → SSR renders the full content, no-JS users see everything.

export function Section({
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
        className="flex w-full items-baseline justify-between gap-3 px-5 py-4 text-left md:cursor-default md:pointer-events-none"
      >
        <span className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="font-mono text-[10px] text-text-muted md:hidden"
          >
            {open ? "▾" : "▸"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            &gt; {title}
          </span>
        </span>
        <span className="truncate font-mono text-[11px] text-text-secondary">
          {summary}
        </span>
      </button>
      <div className={cn("md:block", open ? "block" : "hidden")}>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
