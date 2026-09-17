"use client";

import { cn } from "@/lib/utils";

export const UPLOAD_BTN =
  "inline-flex shrink-0 items-center justify-center gap-1.5 border border-dashed border-accent px-3.5 py-2 font-mono text-2xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent-subtle-bg disabled:cursor-not-allowed disabled:opacity-60";

export function CvDropzone({
  onClick,
  busy = false,
  className,
}: {
  onClick: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cn(UPLOAD_BTN, className)}>
      {busy ? "Reading…" : "+ Upload CV"}
    </button>
  );
}
