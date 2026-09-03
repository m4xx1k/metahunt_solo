"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn, STICKY_RAIL } from "@/lib/utils";
import { SaveCvNudge } from "@/features/auth/save-cv-nudge";
import { CandidateProfile } from "@/features/cv-match/CandidateProfile";
import { SkillRecommendations } from "@/features/cv-match/SkillRecommendations";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { cvApi } from "@/lib/api/cv";
import type { NodeRef } from "@/lib/api/vacancies";
import { CvSelect } from "./CvSelect";
import { CvSubscribe } from "./CvSubscribe";

// The right rail once a CV (or a sample) is in view: switch CV, sanity-check the
// extraction, see what to learn next, subscribe. The scored skills come from the
// feed response (`viewerSkills`) so the profile and the cards can never disagree
// on which CV they reflect (MET-144). `unmatched` is the candidate's own
// extraction gap, not per-vacancy — one GET /cv/:id carries it, and its 404 is
// the staleness signal a deleted/GC'd CV trips.
export function FeedRail({
  candidateId,
  viewerSkills,
  isSample,
  profile,
  totalVacancies,
  onPickCv,
  onCandidateGone,
}: {
  candidateId: string;
  viewerSkills: readonly NodeRef[];
  isSample: boolean;
  profile: { title: string; role?: string | null; seniority?: string | null };
  totalVacancies: number;
  onPickCv: (candidateId: string) => void;
  onCandidateGone: (candidateId: string) => void;
}) {
  const { filters } = useUrlFilters();

  const {
    data: cv,
    isError,
    error,
  } = useQuery({
    queryKey: ["cv", candidateId],
    queryFn: () => cvApi.get(candidateId),
    staleTime: 30_000,
  });
  const { data: rec } = useQuery({
    queryKey: ["recs", candidateId],
    queryFn: () => cvApi.recommendations(candidateId),
    enabled: !isSample,
    staleTime: 30_000,
  });

  // A true 404 = the candidate row is gone (DB reset / GC); drop it and fall
  // back to the plain feed. Fire once per candidate — the fallback unmounts us.
  const goneRef = useRef<string | null>(null);
  const notFound = isError && /^api 404\b/.test(error instanceof Error ? error.message : "");
  useEffect(() => {
    if (notFound && goneRef.current !== candidateId) {
      goneRef.current = candidateId;
      onCandidateGone(candidateId);
    }
  }, [notFound, candidateId, onCandidateGone]);

  const matched = viewerSkills.map((s) => ({ ...s, weight: 0 }));

  return (
    <div className={cn("flex flex-col gap-4", STICKY_RAIL)}>
      {!isSample ? <SaveCvNudge /> : null}
      <CvSelect activeId={candidateId} onPick={onPickCv} />
      <CandidateProfile
        candidateId={candidateId}
        title={profile.title}
        role={profile.role}
        seniority={profile.seniority}
        matched={matched}
        unmatched={cv?.unmatched ?? []}
        totalVacancies={totalVacancies}
        isSample={isSample}
      />
      {!isSample && rec ? <SkillRecommendations rec={rec} /> : null}
      <CvSubscribe
        candidateId={candidateId}
        filters={filters}
        label={profile.title}
        disabled={isSample}
      />
    </div>
  );
}
