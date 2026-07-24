import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Bordered surface with an optional header row (title left, meta right) and an
// optional footer strip — the console's single container primitive, so panels
// stop re-declaring the same border/padding/heading trio.
export function Panel({
  title,
  meta,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  meta?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex h-full flex-col border border-border bg-bg-card", className)}>
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="font-display text-sm font-bold tracking-tight text-text-primary">
            {title}
          </h2>
          {meta ? (
            <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
              {meta}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-4 p-5", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="border-t border-border px-5 py-3 font-mono text-xs">{footer}</div>
      ) : null}
    </section>
  );
}
