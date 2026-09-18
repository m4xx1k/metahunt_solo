"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MoreFilters({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-baseline gap-2 font-mono text-2xs uppercase tracking-wider">
          <span aria-hidden className="text-text-muted">
            {open ? "⌄" : ">"}
          </span>
          <span className="font-bold text-text-primary">more filters</span>
        </span>
        <span
          className={cn(
            "font-mono text-2xs",
            activeCount > 0 ? "text-accent" : "text-text-secondary",
          )}
        >
          {activeCount > 0 ? `${activeCount} active` : "any"}
        </span>
      </button>
      <div className={cn(open ? "block" : "hidden")}>{children}</div>
    </div>
  );
}
