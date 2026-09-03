"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { FeedShell } from "@/app/(feed)/_components/FeedShell";
import { cn } from "@/lib/utils";
import { cvApi, type CvIngestResult, type SampleCandidate } from "@/lib/api/cv";
import { meApi } from "@/lib/api/me";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { useSession } from "@/features/auth/use-session";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { useFeedSearch } from "../_hooks/use-feed-search";
import { ColdRecsTeaser } from "./ColdRecsTeaser";
import { CvDropzone } from "./CvDropzone";

// The feed's interactive island (MET-144 step 7b: no cold/warm fork left). It
// owns upload, CV switching and sample picking; `<FeedShell>` owns the query,
// the list and the rail. A real CV is never a URL param — the `["me","cv"]`
// row with `isActive: true` (the same one GET /feed's JWT resolution scores
// against) is the source of truth, plus a just-uploaded CV and `saved.activeCv`
// as first-paint bridges. `?sample=<id>` scores the page against an allowlisted
// seeded candidate, open to anyone.
export function FeedShellIsland({
  aggregates,
  tracks,
  activeTrackSlug,
  presetRoles,
  presetSkills,
  contextualSkills,
  roleCatalog,
  skillCatalog,
  domainCatalog,
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
  samples: SampleCandidate[];
}) {
  const search = useFeedSearch();
  const { sample, setSample } = search;
  const analytics = useAnalytics();
  const saved = useSaved();
  const { isLoggedIn } = useSession();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const pushShallow = useShallowSearchParams();

  // `?open=cv` (buildMatchHref / MyCvPanel) once meant "land in the warm lens".
  // There is no lens now — the scored feed is just the default once a CV is
  // active — so it is only stripped, not read.
  useEffect(() => {
    if (searchParams.has("open")) pushShallow((n) => n.delete("open"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<CvIngestResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerUpload = useCallback(() => fileInputRef.current?.click(), []);
  // After acting on the upload bar, park it just under the sticky header
  // (scroll-margin clears it). On mobile the bar is fixed at the bottom, so
  // bring the content it controls up to the top instead.
  const scrollToControls = useCallback(() => {
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

  // The signed-in owner's own CVs, `isActive` included — the same row
  // GET /feed's JWT resolution scores against. Shares its cache key with
  // useMyCvs() (CvSelect's own read), so this costs no extra request.
  const { data: myCvs } = useQuery({
    queryKey: ["me", "cv"],
    queryFn: meApi.listCvs,
    enabled: isLoggedIn,
    staleTime: 60_000,
  });
  const activeServerCv = myCvs?.find((c) => c.isActive) ?? null;
  // A CV uploaded THIS render beats the (not-yet-refetched) server list; a
  // `saved.activeCv` local hint covers the same brief window on first paint.
  const realCandidateId =
    uploadInfo?.candidateId ?? activeServerCv?.candidateId ?? saved.activeCv ?? null;
  const candidateId = sample ?? realCandidateId;
  const isSample = sample != null;

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
        // The upload already made this the active CV server-side
        // (CandidateLoaderService.setActiveCv) — catch the switcher up, and
        // drop any list scored against the CV this one just replaced.
        saved.setActiveCv(info.candidateId);
        void qc.invalidateQueries({ queryKey: ["me", "cv"] });
        void qc.invalidateQueries({ queryKey: ["feed"] });
        setSample(null);
        scrollToControls();
      } catch (e) {
        analytics.cvUploadFailed();
        setUploadError(e instanceof Error ? e.message : "Couldn't process the file");
      } finally {
        setUploading(false);
      }
    },
    [analytics, saved, setSample, qc, scrollToControls, isLoggedIn],
  );

  // Pessimistic on purpose. The feed's cards are scored server-side against the
  // JWT's ACTIVE CV — the picked id never travels with the list request — so
  // flipping local state first would render one CV's profile beside the other
  // CV's cards until the mutation lands. Activate, then let the invalidations
  // pull both halves forward together (commit 0c7854c).
  const onPickCv = useCallback(
    (id: string) => {
      const link = myCvs?.find((c) => c.candidateId === id);
      if (!link) return;
      void meApi
        .activateCv(link.id)
        .then(() => {
          saved.setActiveCv(id);
          return Promise.all([
            qc.invalidateQueries({ queryKey: ["me", "cv"] }),
            qc.invalidateQueries({ queryKey: ["feed"] }),
          ]);
        })
        .catch(() => toast.error("Couldn't switch CV"));
    },
    [saved, myCvs, qc],
  );

  // A saved CV whose row no longer resolves (DB reset / GC): drop it + fall back.
  const onCandidateGone = useCallback(
    (id: string) => {
      saved.removeCv(id);
      void qc.invalidateQueries({ queryKey: ["me", "cv"] });
      toast.error("This CV is no longer available");
    },
    [saved, qc],
  );

  const uploaded = uploadInfo?.candidateId === candidateId ? uploadInfo : null;
  const sampleLabel = samples.find((s) => s.candidateId === sample)?.label;
  const profileTitle = uploaded ? "Your CV" : sampleLabel ? `Profile · ${sampleLabel}` : "Your CV";

  return (
    <div className="flex flex-col gap-4">
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
          "z-40 sm:z-30 flex items-center gap-3 border-t px-3 py-2.5 transition-colors",
          "fixed inset-x-0 bottom-0 sm:static sm:border sm:scroll-mt-24",
          dragging ? "border-accent bg-accent/5" : "border-border bg-bg-card",
        )}
      >
        <div className="ml-auto">
          <CvDropzone onClick={triggerUpload} busy={uploading} />
        </div>
      </div>

      <div ref={contentRef} className="flex scroll-mt-24 flex-col gap-4">
        {/* CV-privacy print attached to the upload control — kept out of the
            control bar's flex row so it can't stretch it. */}
        <Link
          href="/privacy#cv"
          className="-mt-2 self-end font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          AI processed · raw text not stored
        </Link>
        {uploadError ? (
          <p className="border border-danger/40 bg-danger/5 px-4 py-2 font-mono text-xs text-danger">
            {uploadError}
          </p>
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
          viewer={
            candidateId
              ? {
                  candidateId,
                  isSample,
                  profile: {
                    title: profileTitle,
                    role: uploaded?.role,
                    seniority: uploaded?.seniority,
                  },
                  onPickCv,
                  onCandidateGone,
                }
              : null
          }
          coldRail={
            <div className="flex flex-col gap-4">
              <ColdRecsTeaser
                savedCvId={realCandidateId}
                onUnlock={onPickCv}
                onUpload={triggerUpload}
              />
              {samples.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
                  <span>…or try a sample profile:</span>
                  {samples.map((s) => (
                    <button
                      key={s.candidateId}
                      type="button"
                      onClick={() => {
                        setSample(s.candidateId);
                        scrollToControls();
                      }}
                      className="border border-border px-2.5 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          }
        />
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
