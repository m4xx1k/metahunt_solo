"use client";

import { useCallback, useState } from "react";

import { FeedShell } from "@/app/(feed)/_components/FeedShell";
import { cvApi, type CvIngestResult, type SampleCandidate } from "@/lib/api/cv";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { OptionRow } from "@/features/vacancy-filters/types";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { useMergedSearch } from "../_hooks/use-merged-search";
import { CvDropzone } from "./CvDropzone";
import { LensTabs } from "./LensTabs";
import { TracksBand } from "./TracksBand";
import { WarmBody } from "./WarmBody";

// The merged route's interactive island. The lens is derived from ?cv: cold =
// the feed body reused via <FeedShell> (no fork; hideTrackTree — the top-band
// replaces the sidebar tree); warm = the ranked <WarmBody> under the active CV.
// Upload/sample selection sets ?cv (→ warm); the browse tab drops it (→ cold).
export function MergedShell({
  aggregates,
  tracks,
  activeTrackSlug,
  presetRoles,
  presetSkills,
  contextualSkills,
  roleCatalog,
  skillCatalog,
  domainCatalog,
  domainOptions,
  samples,
}: {
  aggregates: VacancyAggregates;
  tracks: TrackDto[];
  activeTrackSlug: string | null;
  presetRoles?: TrackAxis[];
  presetSkills?: TrackAxis[];
  contextualSkills?: TrackAxis[];
  roleCatalog?: TrackAxis[];
  skillCatalog?: TrackAxis[];
  domainCatalog?: TrackAxis[];
  domainOptions?: OptionRow[];
  samples: SampleCandidate[];
}) {
  const search = useMergedSearch();
  const { lens, cv, setCv, setTrack } = search;
  const analytics = useAnalytics();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<CvIngestResult | null>(null);

  const onLens = useCallback(
    (to: "cold" | "warm") => {
      if (to === "cold") setCv(null);
    },
    [setCv],
  );

  const onFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setUploading(true);
      try {
        const info = await cvApi.uploadFile(file);
        setUploadInfo(info);
        analytics.cvUpload(info.candidateId, info.reused);
        setCv(info.candidateId);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "не вдалося обробити файл");
      } finally {
        setUploading(false);
      }
    },
    [analytics, setCv],
  );

  const isSample = cv != null && samples.some((s) => s.candidateId === cv);
  const uploaded = uploadInfo?.candidateId === cv ? uploadInfo : null;
  const sampleLabel = samples.find((s) => s.candidateId === cv)?.label;
  const profileTitle = uploaded
    ? "твоє CV"
    : sampleLabel
      ? `профіль · ${sampleLabel}`
      : "твоє CV";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <LensTabs lens={lens} cvLocked={cv == null} onSelect={onLens} />
        <CvDropzone onFile={onFile} busy={uploading} />
      </div>

      {uploadError ? (
        <p className="border border-danger/40 bg-danger/5 px-4 py-2 font-mono text-xs text-danger">
          {uploadError}
        </p>
      ) : null}

      {lens === "warm" && cv ? (
        <WarmBody
          api={search}
          candidateId={cv}
          domainOptions={domainOptions}
          profileTitle={profileTitle}
          profileRole={uploaded?.role}
          profileSeniority={uploaded?.seniority}
          showRecs={!isSample}
        />
      ) : (
        <>
          {samples.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
              <span>або приміряй готовий профіль:</span>
              {samples.map((s) => (
                <button
                  key={s.candidateId}
                  type="button"
                  onClick={() => setCv(s.candidateId)}
                  className="border border-border px-2.5 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}

          <TracksBand tracks={tracks} activeSlug={activeTrackSlug} onSelect={setTrack} />

          <FeedShell
            aggregates={aggregates}
            tracks={tracks}
            activeTrackSlug={activeTrackSlug}
            presetRoles={presetRoles}
            presetSkills={presetSkills}
            contextualSkills={contextualSkills}
            roleCatalog={roleCatalog}
            skillCatalog={skillCatalog}
            domainCatalog={domainCatalog}
            hideTrackTree
          />
        </>
      )}
    </div>
  );
}
