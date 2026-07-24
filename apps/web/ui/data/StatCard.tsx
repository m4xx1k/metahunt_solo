import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatTone = "default" | "accent" | "danger" | "success";

const VALUE_TONE: Record<StatTone, string> = {
  default: "text-text-primary",
  accent: "text-accent",
  danger: "text-danger",
  success: "text-success",
};

// The console's only KPI tile. Pass `href` to make it a drill-down: the whole
// card becomes the link target (overview widgets are all clickable).
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
          {label}
        </span>
        {href ? (
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 shrink-0 text-text-muted transition-colors group-hover:text-accent"
          />
        ) : null}
      </div>
      <span
        className={cn(
          "font-display text-3xl font-bold leading-none tabular-nums",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="mt-auto font-mono text-2xs leading-relaxed text-text-muted">{hint}</span>
      ) : null}
    </>
  );

  const shell = cn(
    "group flex h-full min-h-[124px] flex-col gap-3 border bg-bg-card p-5 text-left",
    tone === "danger" ? "border-danger/60" : "border-border",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(shell, "transition-colors hover:border-accent hover:bg-bg-elev")}
      >
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
