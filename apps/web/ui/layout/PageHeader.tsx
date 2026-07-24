import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Sticky screen header for the operator console: one title, one optional hint
// line, controls on the right, and an optional tab row docked underneath.
// `top-14` on mobile clears the fixed console top bar.
export function PageHeader({
  title,
  hint,
  eyebrow,
  actions,
  tabs,
  className,
}: {
  title: string;
  hint?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-14 z-30 flex flex-col border-b border-border bg-bg/90 backdrop-blur md:top-0",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-5 md:px-8">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow}
          <h1 className="truncate font-display text-xl font-bold tracking-tight text-text-primary md:text-2xl">
            {title}
          </h1>
          {hint ? <p className="font-mono text-xs text-text-muted">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      {tabs ? <div className="mx-auto w-full max-w-[1400px] px-5 md:px-8">{tabs}</div> : null}
    </header>
  );
}
