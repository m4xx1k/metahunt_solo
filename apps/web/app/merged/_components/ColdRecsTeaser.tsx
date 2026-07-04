"use client";

import { useQuery } from "@tanstack/react-query";

import { cvApi } from "@/lib/api/cv";
import { SkillRecommendations } from "@/app/reverse-ats/_components/SkillRecommendations";
import { UPLOAD_BTN } from "./CvDropzone";

// Cold-lens teaser for the ranked experience. With a saved CV we blur its real
// "what to learn next" recs behind an unlock CTA (a genuine preview of the
// user's own data); with no saved CV we show a skeleton + an upload prompt.
// Shares the ["recs", id] query key with the warm hook, so unlocking reuses the
// cached fetch. Upload is routed through the shell's central picker.
export function ColdRecsTeaser({
  savedCvId,
  onUnlock,
  onUpload,
}: {
  savedCvId: string | null;
  onUnlock: (candidateId: string) => void;
  onUpload: () => void;
}) {
  const { data: rec } = useQuery({
    queryKey: ["recs", savedCvId],
    queryFn: () => cvApi.recommendations(savedCvId as string),
    enabled: savedCvId != null,
    staleTime: 30_000,
  });

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none select-none blur-[3px]">
        {rec ? <SkillRecommendations rec={rec} /> : <TeaserSkeleton />}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/80 px-5 text-center">
        <p className="font-mono text-xs leading-relaxed text-text-secondary">
          {savedCvId
            ? "See your ranked matches and the skills that unlock the most jobs."
            : "Upload your CV to unlock the ranked list and skill recommendations."}
        </p>
        {savedCvId ? (
          <button
            type="button"
            onClick={() => onUnlock(savedCvId)}
            className="border border-accent bg-accent px-4 py-2 font-mono text-2xs font-bold uppercase tracking-wider text-bg shadow-brut-xs transition-transform hover:-translate-x-px hover:-translate-y-px"
          >
            Unlock your matches
          </button>
        ) : (
          <button type="button" onClick={onUpload} className={UPLOAD_BTN}>
            + Upload CV
          </button>
        )}
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
