"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FeedShell } from "@/app/(feed)/_components/FeedShell";
import { cn } from "@/lib/utils";
import { cvApi, type CvIngestResult, type SampleCandidate } from "@/lib/api/cv";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { useSession } from "@/features/auth/use-session";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { OptionRow } from "@/features/vacancy-filters/types";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { useFeedSearch } from "../_hooks/use-feed-search";
import { ColdRecsTeaser } from "./ColdRecsTeaser";
import { CvDropzone } from "./CvDropzone";
import { LensTabs, LENS_PANEL_ID, lensTabId } from "./LensTabs";
import { TracksBand } from "./TracksBand";
import { WarmBody } from "./WarmBody";

// The merged route's interactive island. The lens is derived from ?cv: cold =
// the feed body reused via <FeedShell> (no fork; hideTrackTree — the top-band
// replaces the sidebar tree); warm = the ranked <WarmBody> under the active CV.
// Upload/sample selection sets ?cv (→ warm); the browse tab drops it (→ cold).
export function FeedLensShell({
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
  const search = useFeedSearch();
  const { lens, cv, setCv, setTrack } = search;
  const analytics = useAnalytics();
  const saved = useSaved();
  const { isLoggedIn } = useSession();

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<CvIngestResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerUpload = useCallback(() => fileInputRef.current?.click(), []);
  // After acting on the lens/upload bar, park it just under the sticky header
  // (scroll-margin clears the header). On mobile the bar is a fixed bottom bar,
  // so bring the content it controls up to the top instead.
  const scrollToControls = useCallback(() => {
    // Wait for the lens switch to commit — tracks appear/disappear above the bar
    // and shift the layout — before measuring the scroll target.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = window.matchMedia("(min-width: 640px)").matches
          ? barRef.current
          : contentRef.current;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }),
    );
  }, []);

  // The "how it works" CTA lives in the hero (a server subtree above this
  // island), so it reaches upload via a window event rather than a shared store.
  useEffect(() => {
    window.addEventListener("feed:upload-cv", triggerUpload);
    return () => window.removeEventListener("feed:upload-cv", triggerUpload);
  }, [triggerUpload]);

  // Browse drops ?cv (keeps activeCv); the CV tab, unlocked by a remembered
  // activeCv, re-ranks it in one click.
  const onLens = useCallback(
    (to: "cold" | "warm") => {
      if (to === "cold") setCv(null);
      else if (cv == null && saved.activeCv) setCv(saved.activeCv);
      scrollToControls();
    },
    [setCv, cv, saved.activeCv, scrollToControls],
  );

  const onFile = useCallback(
    async (file: File) => {
      if (!isLoggedIn) {
        toast.error("Log in with Telegram before uploading a CV");
        return;
      }
      setUploadError(null);
      setUploading(true);
      try {
        const info = await cvApi.uploadFile(file);
        setUploadInfo(info);
        analytics.cvUpload(info.reused);
        saved.addCv({
          candidateId: info.candidateId,
          label: info.role ?? "Your CV",
          addedAt: Date.now(),
        });
        // The API creates the ownership link atomically with the upload.
        setCv(info.candidateId);
        scrollToControls();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Couldn't process the file");
      } finally {
        setUploading(false);
      }
    },
    [analytics, saved, setCv, scrollToControls, isLoggedIn],
  );

  const onPickCv = useCallback(
    (id: string) => {
      saved.setActiveCv(id);
      setCv(id);
    },
    [saved, setCv],
  );

  // A saved CV whose row no longer resolves (DB reset / GC): drop it + fall back.
  const onCandidateGone = useCallback(
    (id: string) => {
      saved.removeCv(id);
      setCv(null);
      toast.error("This CV is no longer available");
    },
    [saved, setCv],
  );

  const isSample = cv != null && samples.some((s) => s.candidateId === cv);
  const uploaded = uploadInfo?.candidateId === cv ? uploadInfo : null;
  const sampleLabel = samples.find((s) => s.candidateId === cv)?.label;
  const profileTitle = uploaded ? "Your CV" : sampleLabel ? `Profile · ${sampleLabel}` : "Your CV";

  return (
    <div className="flex flex-col gap-4">
      {lens === "cold" ? (
        <TracksBand tracks={tracks} activeSlug={activeTrackSlug} onSelect={setTrack} />
      ) : null}

      <div
        ref={barRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          // Fixed thumb-bar at the bottom on mobile; a static top bar from sm up.
          // z-40 only matters for the mobile fixed bar; as a static flex item on
          // sm+ the z-index is still honoured, so drop below the sticky header
          // (z-40) or it paints over the header on scroll.
          "z-40 sm:z-30 flex items-center gap-3 border-t px-3 py-2.5 transition-colors",
          "fixed inset-x-0 bottom-0 sm:static sm:border sm:scroll-mt-24",
          dragging ? "border-accent bg-accent/5" : "border-border bg-bg-card",
        )}
      >
        <LensTabs lens={lens} cvLocked={cv == null && saved.activeCv == null} onSelect={onLens} />
        <div className="ml-auto">
          <CvDropzone onClick={triggerUpload} busy={uploading} />
        </div>
      </div>

      <div
        ref={contentRef}
        role="tabpanel"
        id={LENS_PANEL_ID}
        aria-labelledby={lensTabId(lens)}
        className="flex scroll-mt-24 flex-col gap-4"
      >
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
            isSample={isSample}
            onCandidateGone={onCandidateGone}
            onPickCv={onPickCv}
          />
        ) : (
          <>
            {samples.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
                <span>…or try a sample profile:</span>
                {samples.map((s) => (
                  <button
                    key={s.candidateId}
                    type="button"
                    onClick={() => {
                      setCv(s.candidateId);
                      scrollToControls();
                    }}
                    className="border border-border px-2.5 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}

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
              rightRail={
                <ColdRecsTeaser
                  savedCvId={saved.activeCv}
                  onUnlock={onPickCv}
                  onUpload={triggerUpload}
                />
              }
            />
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const ACCEPT = ".pdf,.txt,application/pdf,text/plain";
