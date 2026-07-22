"use client";

import type { SampleCandidate } from "@/lib/api/cv";

// Lives in the hero (a server subtree above the lens island), so picking a
// sample reaches CV state via a window event — same reach-through pattern as
// UploadCta, whose input/state also lives in <FeedLensShell>.
export function SampleProfiles({ samples }: { samples: SampleCandidate[] }) {
  if (samples.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted md:justify-end">
      <span>…or try a sample profile:</span>
      {samples.map((s) => (
        <button
          key={s.candidateId}
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("feed:select-sample", { detail: s.candidateId }))
          }
          className="border border-border px-2.5 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
