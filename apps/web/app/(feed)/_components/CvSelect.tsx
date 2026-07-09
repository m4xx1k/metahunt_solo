"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { useMyCvs } from "../_hooks/use-my-cvs";

// Absolute date + time, so two CVs with the same role label are still distinct.
const formatUploadedAt = (ts: number) =>
  new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// Compact saved-CV switcher for the warm CV-info column. Inline expander (not an
// absolute dropdown) so it can't be clipped by the rail's overflow-y-auto.
// Doubles as the current-CV label; picking one re-ranks under that CV.
export function CvSelect({
  activeId,
  onPick,
}: {
  activeId: string;
  onPick: (candidateId: string) => void;
}) {
  const cvs = useMyCvs();
  const [open, setOpen] = useState(false);

  if (cvs.length === 0) return null;

  const active = cvs.find((c) => c.candidateId === activeId);

  return (
    <div className="border border-border bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 font-mono text-2xs uppercase tracking-wider text-text-secondary transition-colors hover:text-accent"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-text-muted">CV</span>
          <span className="truncate text-text-primary">
            {active?.label ?? "Switch CV"}
          </span>
        </span>
        <span aria-hidden className="text-[8px] leading-none">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div className="max-h-64 overflow-y-auto border-t border-border">
          {cvs.map((cv) => (
            <button
              key={cv.candidateId}
              type="button"
              onClick={() => {
                if (cv.candidateId !== activeId) onPick(cv.candidateId);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-2 text-left font-mono transition-colors",
                cv.candidateId === activeId
                  ? "text-accent"
                  : "text-text-primary hover:bg-bg-elev hover:text-accent",
              )}
            >
              <span className="block truncate text-xs">
                {cv.candidateId === activeId ? "● " : ""}
                {cv.label}
              </span>
              <span className="block text-2xs text-text-muted">
                {formatUploadedAt(cv.addedAt)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
