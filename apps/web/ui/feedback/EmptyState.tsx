import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Single stand-in for "nothing here", "loading", and "this failed" inside a
// console surface, so those three states stop being ad-hoc <p> tags.
export function EmptyState({
  title,
  titleAs: Title = "span",
  hint,
  action,
  tone = "default",
  className,
}: {
  title: string;
  /** A page whose only content is an empty state still needs its heading. */
  titleAs?: "span" | "h1" | "h2";
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
      <Title
        className={cn(
          "font-display text-sm font-bold",
          tone === "danger" ? "text-danger" : "text-text-primary",
        )}
      >
        {title}
      </Title>
      {hint ? <p className="max-w-prose font-mono text-xs text-text-muted">{hint}</p> : null}
      {action}
    </div>
  );
}
