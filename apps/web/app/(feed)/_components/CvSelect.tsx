"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useMyCvs } from "../_hooks/use-my-cvs";
import { CvDropzone } from "./CvDropzone";

// Absolute date + time, so two CVs with the same role label are still distinct.
const formatUploadedAt = (ts: number) =>
  new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// The CV card at the top of the warm rail: which CV is scoring this page, the
// switcher for the others, and the page's one upload control once a CV is in
// view (<ColdRecsTeaser> is its cold twin). One bordered box rather than three
// stacked ones — they are all the same subject. The switcher is an inline
// expander, not an absolute dropdown, so the rail's overflow-y-auto can't clip
// it; picking a CV re-ranks the feed under it.
export function CvSelect({
  activeId,
  onPick,
  onUpload,
  uploading,
}: {
  activeId: string;
  onPick: (candidateId: string) => void;
  onUpload: () => void;
  uploading: boolean;
}) {
  const cvs = useMyCvs();
  const [open, setOpen] = useState(false);

  // A sample viewer owns nothing: no switcher, but uploading is exactly how you
  // stop looking at someone else's profile, so the card stays.
  const active = cvs.find((c) => c.candidateId === activeId);

  return (
    <div className="flex flex-col border border-border bg-bg-card">
      {cvs.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            disabled={cvs.length < 2}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 font-mono text-2xs uppercase tracking-wider text-text-secondary transition-colors hover:text-accent disabled:cursor-default disabled:hover:text-text-secondary"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="text-text-muted">CV</span>
              <span className="truncate text-text-primary">{active?.label ?? "Switch CV"}</span>
            </span>
            {cvs.length > 1 ? (
              <span aria-hidden className="text-[8px] leading-none">
                {open ? "▴" : "▾"}
              </span>
            ) : null}
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
        </>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t border-border p-3 first:border-t-0">
        <CvDropzone onClick={onUpload} busy={uploading} className="w-full" />
        <Link
          href="/privacy#cv"
          className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          AI processed · raw text not stored
        </Link>
      </div>
    </div>
  );
}
