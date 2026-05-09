"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "danger";

const TONE_BORDER: Record<Tone, string> = {
  default: "border-border",
  accent: "border-accent",
  danger: "border-danger",
};

type Props = {
  label: string;
  tone?: Tone;
  onClick?: () => void;
  ariaLabel?: string;
  children: ReactNode;
};

export function KpiCard({
  label,
  tone = "default",
  onClick,
  ariaLabel,
  children,
}: Props) {
  const interactive = typeof onClick === "function";
  const className = cn(
    "flex flex-col gap-3 border bg-bg-card p-5 text-left shadow-[6px_6px_0_0_#000]",
    TONE_BORDER[tone],
    interactive &&
      "cursor-pointer transition-[transform,box-shadow] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0_0_#000]",
  );
  const labelEl = (
    <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
      {label}
    </span>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={className}
      >
        {labelEl}
        {children}
      </button>
    );
  }
  return (
    <div className={className} aria-label={ariaLabel}>
      {labelEl}
      {children}
    </div>
  );
}
