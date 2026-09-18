"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { useMyCvs } from "../_hooks/use-my-cvs";
import { CvDropzone } from "./CvDropzone";
import { RailCard } from "./RailCard";

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

  return (
    <RailCard
      title="your CV"
      meta={cvs.length > 1 ? cvs.length : null}
      picker={
        cvs.length > 0
          ? cvs.map((cv) => (
              <button
                key={cv.candidateId}
                type="button"
                aria-pressed={cv.candidateId === activeId}
                onClick={() => {
                  if (cv.candidateId !== activeId) onPick(cv.candidateId);
                }}
                className={cn(
                  "block w-full px-3 py-2 text-left font-mono transition-colors",
                  cv.candidateId === activeId
                    ? "bg-accent-subtle-bg text-accent"
                    : "text-text-secondary hover:bg-bg-elev hover:text-accent",
                )}
              >
                <span className="block truncate text-2xs font-bold">{cv.label}</span>
                <span className="block text-2xs text-text-muted">
                  {formatUploadedAt(cv.addedAt)}
                </span>
              </button>
            ))
          : null
      }
      action={
        <>
          <CvDropzone onClick={onUpload} busy={uploading} className="w-full" />
          <Link
            href="/privacy#cv"
            className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
          >
            AI processed · raw text not stored
          </Link>
        </>
      }
    />
  );
}
