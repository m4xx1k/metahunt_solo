"use client";

import { useEffect, useRef } from "react";

import { cn, STICKY_RAIL } from "@/lib/utils";
import { CandidateProfile } from "@/features/cv-match/CandidateProfile";
import { SkillRecommendations } from "@/features/cv-match/SkillRecommendations";
import { MatchFilters } from "./MatchFilters";
import { Pagination } from "@/ui/navigation/Pagination";
import type { FiltersApi, OptionRow } from "@/features/vacancy-filters/types";
import { useFeedWarm } from "../_hooks/use-feed-warm";
import { CvSelect } from "./CvSelect";
import { WarmCard } from "./WarmCard";
import { WarmSubscribe } from "./WarmSubscribe";

// Warm lens body: ranked list under the active CV. Subscribe + filters on the
// left, ranked WarmCards in the centre, CV profile + recommendations on the
// right. Demo samples have no owner, so they skip subscribe and recommendations
// (both are owner-scoped).
export function WarmBody({
  api,
  candidateId,
  domainOptions,
  profileTitle,
  profileRole,
  profileSeniority,
  isSample,
  onCandidateGone,
  onPickCv,
}: {
  api: FiltersApi;
  candidateId: string;
  domainOptions?: OptionRow[];
  profileTitle: string;
  profileRole?: string | null;
  profileSeniority?: string | null;
  isSample: boolean;
  onCandidateGone: (candidateId: string) => void;
  onPickCv: (candidateId: string) => void;
}) {
  const { data, rec, page, pageSize, busy, errorMsg, notFound, goToOffset } =
    useFeedWarm(candidateId, api.filters, !isSample);

  // Fire at most once per candidate — dropping it flips to cold and unmounts
  // this component, so a re-fire would loop against its own state updates.
  const goneRef = useRef<string | null>(null);
  useEffect(() => {
    if (notFound && goneRef.current !== candidateId) {
      goneRef.current = candidateId;
      onCandidateGone(candidateId);
    }
  }, [notFound, candidateId, onCandidateGone]);

  const candidateSkillIds = data?.resolved.matched.map((s) => s.id) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-start">
      <div className={cn("flex flex-col gap-4", STICKY_RAIL)}>
        <WarmSubscribe
          candidateId={candidateId}
          filters={api.filters}
          label={profileTitle}
          disabled={isSample}
        />
        <MatchFilters api={api} domainOptions={domainOptions} disabled={busy} />
      </div>

      <div className="flex flex-col gap-5">
        {errorMsg ? (
          <p className="border border-danger/40 bg-danger/5 px-4 py-3 font-mono text-sm text-danger">
            Error: {errorMsg}
          </p>
        ) : null}
        {busy ? <p className="font-mono text-sm text-text-muted">Ranking…</p> : null}
        {!busy && data && data.items.length === 0 ? (
          <p className="border border-border bg-bg-card px-4 py-6 text-center font-mono text-sm text-text-muted">
            No matches for this CV — try clearing the filters or uploading another.
          </p>
        ) : null}

        {data?.items.map((item) => (
          <WarmCard
            key={item.vacancy.id}
            item={item}
            candidateSkillIds={candidateSkillIds}
          />
        ))}

        {data && data.total > pageSize ? (
          <div className="mt-2 border-t border-border pt-5">
            <Pagination
              total={data.total}
              limit={pageSize}
              offset={(page - 1) * pageSize}
              onNavigate={goToOffset}
            />
          </div>
        ) : null}
      </div>

      {data ? (
        <div className={cn("order-first flex flex-col gap-4 xl:order-none", STICKY_RAIL)}>
          <CvSelect activeId={candidateId} onPick={onPickCv} />
          <CandidateProfile
            title={profileTitle}
            role={profileRole}
            seniority={profileSeniority}
            matched={data.resolved.matched}
            unmatched={data.resolved.unmatched}
            totalVacancies={data.total}
          />
          {!isSample && rec ? <SkillRecommendations rec={rec} /> : null}
        </div>
      ) : null}
    </div>
  );
}
