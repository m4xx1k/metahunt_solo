import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Single stand-in for "nothing here", "loading", and "this failed" inside a
// console surface, so those three states stop being ad-hoc <p> tags.
export function EmptyState({
  title,
  hint,
  action,
  tone = "default",
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 border border-dashed p-6",
        tone === "danger" ? "border-danger/60" : "border-border",
        className,
      )}
    >
      <span
        className={cn(
          "font-display text-sm font-bold",
          tone === "danger" ? "text-danger" : "text-text-primary",
        )}
      >
        {title}
      </span>
      {hint ? <p className="max-w-prose font-mono text-xs text-text-muted">{hint}</p> : null}
      {action}
    </div>
  );
}
