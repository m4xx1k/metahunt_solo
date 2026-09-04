"use client";

import { UPLOAD_BTN } from "./CvDropzone";

// Cold-lens teaser for the ranked experience: a blurred skeleton of the "what
// to learn next" recs behind an upload prompt. The shell only mounts this when
// there's no viewer, so there's never a saved CV to preview real recs from —
// it's always the skeleton. Upload is routed through the shell's central picker.
export function ColdRecsTeaser({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none select-none blur-[3px]">
        <TeaserSkeleton />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/80 px-5 text-center">
        <p className="font-mono text-xs leading-relaxed text-text-secondary">
          Upload your CV to unlock the ranked list and skill recommendations.
        </p>
        <button type="button" onClick={onUpload} className={UPLOAD_BTN}>
          + Upload CV
        </button>
      </div>
    </div>
  );
}

function TeaserSkeleton() {
  return (
    <div className="border border-border bg-bg-card">
      <div className="h-1 bg-success" />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="h-2 w-28 bg-border" />
        <div className="flex flex-col gap-3">
          {[80, 62, 45, 34].map((w) => (
            <div key={w} className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="h-2 w-20 bg-border" />
                <span className="h-2 w-6 bg-border" />
              </div>
              <div className="h-2 w-full bg-border">
                <div className="h-full bg-success/50" style={{ width: `${w}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
