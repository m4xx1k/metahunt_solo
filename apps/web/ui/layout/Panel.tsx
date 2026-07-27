import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ScopeChip, type Scope } from "@/ui/data/ScopeChip";

// Bordered surface with an optional header row (title left, meta right) and an
// optional footer strip — the console's single container primitive, so panels
// stop re-declaring the same border/padding/heading trio. `scope` states which
// clock the panel's numbers are on; pass it on anything time-dependent.
export function Panel({
  title,
  tone = "default",
  meta,
  scope,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  tone?: "default" | "danger";
  meta?: ReactNode;
  scope?: Scope;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn("flex h-full flex-col border border-border bg-bg-card", className)}
    >
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
          <h2
            className={cn(
              "font-display text-sm font-bold tracking-tight",
              tone === "danger" ? "text-danger" : "text-text-primary",
            )}
          >
            {title}
          </h2>
          <span className="flex items-center gap-2">
            {meta ? (
              <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
                {meta}
              </span>
            ) : null}
            {scope ? <ScopeChip scope={scope} /> : null}
          </span>
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-4 p-5", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="border-t border-border px-5 py-3 font-mono text-xs">{footer}</div>
      ) : null}
    </section>
  );
}
