"use client";

import { useCallback } from "react";

import { FeedShell } from "@/app/(feed)/_components/FeedShell";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { useMergedSearch } from "../_hooks/use-merged-search";
import { CvDropzone } from "./CvDropzone";
import { LensTabs } from "./LensTabs";
import { TracksBand } from "./TracksBand";

// Lens chrome (tabs + CV dropzone + tracks top-band) over the cold feed body.
// The body reuses <FeedShell> wholesale (hideTrackTree — the top-band replaces
// its sidebar tree); no fork. Warm body + upload land in PR2.
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
}) {
  const { setCv, setTrack } = useMergedSearch();

  // PR1 pins the lens cold + keeps the CV tab locked; PR2 flips this to the
  // derived lens (useMergedSearch().lens) + a warm body.
  const onLens = useCallback(
    (to: "cold" | "warm") => {
      if (to === "cold") setCv(null);
    },
    [setCv],
  );

  const onFile = useCallback((_file: File) => {
    // PR2: cvApi.uploadFile(file) → setCv(candidateId) → warm; write activeCv.
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <LensTabs lens="cold" cvLocked onSelect={onLens} />
        <CvDropzone onFile={onFile} />
      </div>

      <TracksBand
        tracks={tracks}
        activeSlug={activeTrackSlug}
        onSelect={setTrack}
      />

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
    </div>
  );
}
