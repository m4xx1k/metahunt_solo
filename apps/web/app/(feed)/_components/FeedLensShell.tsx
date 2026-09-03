"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { FeedShell } from "@/app/(feed)/_components/FeedShell";
import { cn } from "@/lib/utils";
import { cvApi, type CvIngestResult, type SampleCandidate } from "@/lib/api/cv";
import { meApi } from "@/lib/api/me";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { Lens } from "@/lib/analytics/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { useSession } from "@/features/auth/use-session";
import type { TrackAxis } from "@/features/tracks/TrackAxisSection";
import type { OptionRow } from "@/features/vacancy-filters/types";
import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { TrackDto } from "@/lib/api/tracks";
import { useFeedSearch } from "../_hooks/use-feed-search";
import { ColdRecsTeaser } from "./ColdRecsTeaser";
import { CvDropzone } from "./CvDropzone";
import { LensTabs, LENS_PANEL_ID, lensTabId } from "./LensTabs";
import { WarmBody } from "./WarmBody";

// The merged route's interactive island. `?sample` forces the warm lens onto
// an allowlisted seeded candidate, open to anyone; a real CV never lives in
// the URL (MET-144 step 7) — `myCvs`'s `isActive` row (the JWT-resolved one
// GET /feed itself scores against) is the source of truth, and `manualLens`
// is only which tab the user last clicked (mirrors the old ?cv-present /
// ?cv-absent split, just without a URL round trip). cold = the feed body
// reused via <FeedShell> (no fork; hideTrackTree — the top-band replaces the
// sidebar tree); warm = the ranked <WarmBody> under the resolved candidate.
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
  const { sample, setSample } = search;
  const analytics = useAnalytics();
  const saved = useSaved();
  const { isLoggedIn } = useSession();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const pushShallow = useShallowSearchParams();

  // Which tab the user last clicked, independent of the URL — "warm" only
  // ever renders when a candidate actually resolves (see `candidateId` below).
  // `?open=cv` (buildMatchHref, the /match onboarding flow's completion
  // redirect) seeds it once, id-free — not a capability token, just "land in
  // the ranked view instead of a second click" — then gets stripped so it
  // isn't a lingering fossil.
  const [manualLens, setManualLens] = useState<Lens>(() =>
    searchParams.get("open") === "cv" ? "warm" : "cold",
  );
  useEffect(() => {
    if (searchParams.has("open")) pushShallow((n) => n.delete("open"));
    // Only ever runs for the one-shot redirect landing — not a searchParams sync.
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
  // After acting on the lens/upload bar, park it just under the sticky header
  // (scroll-margin clears the header). On mobile the bar is a fixed bottom bar,
  // so bring the content it controls up to the top instead.
  const scrollToControls = useCallback(() => {
    // Wait for the lens switch to commit before measuring the scroll target.
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
  const lens: Lens = isSample || (manualLens === "warm" && candidateId != null) ? "warm" : "cold";

  // Browse drops any lens choice back to cold; the CV tab needs a resolved
  // candidate to mean anything (LensTabs disables it via `cvLocked` until
  // then).
  const onLens = useCallback(
    (to: Lens) => {
      if (to === "cold") {
        setSample(null);
        setManualLens("cold");
      } else {
        setManualLens("warm");
      }
      scrollToControls();
    },
    [setSample, scrollToControls],
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
        // The upload already made this the active CV server-side
        // (CandidateLoaderService.setActiveCv) — just catch the switcher up.
        saved.setActiveCv(info.candidateId);
        void qc.invalidateQueries({ queryKey: ["me", "cv"] });
        setSample(null);
        setManualLens("warm");
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

  const onPickCv = useCallback(
    (id: string) => {
      saved.setActiveCv(id);
      const link = myCvs?.find((c) => c.candidateId === id);
      if (link) {
        void meApi
          .activateCv(link.id)
          .then(() => qc.invalidateQueries({ queryKey: ["me", "cv"] }))
          .catch(() => toast.error("Couldn't switch CV"));
      }
    },
    [saved, myCvs, qc],
  );

  // A saved CV whose row no longer resolves (DB reset / GC): drop it + fall back.
  const onCandidateGone = useCallback(
    (id: string) => {
      saved.removeCv(id);
      void qc.invalidateQueries({ queryKey: ["me", "cv"] });
      setManualLens("cold");
      toast.error("This CV is no longer available");
    },
    [saved, qc],
  );

  const warmRoleOptions = useMemo<OptionRow[] | undefined>(
    () => roleCatalog?.map((r) => ({ id: r.id, label: r.name, count: r.count ?? 0 })),
    [roleCatalog],
  );
  const warmSkillOptions = useMemo<OptionRow[] | undefined>(
    () =>
      skillCatalog?.map((skill) => ({ id: skill.id, label: skill.name, count: skill.count ?? 0 })),
    [skillCatalog],
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
          // z-40 only matters for the mobile fixed bar; as a static flex item on
          // sm+ the z-index is still honoured, so drop below the sticky header
          // (z-40) or it paints over the header on scroll.
          "z-40 sm:z-30 flex items-center gap-3 border-t px-3 py-2.5 transition-colors",
          "fixed inset-x-0 bottom-0 sm:static sm:border sm:scroll-mt-24",
          dragging ? "border-accent bg-accent/5" : "border-border bg-bg-card",
        )}
      >
        <LensTabs lens={lens} cvLocked={candidateId == null} onSelect={onLens} />
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
        {/* Quiet CV-privacy print attached to the upload control above — kept out
            of the control bar's flex row so it can't stretch/overflow it. */}
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

        {lens === "warm" && candidateId ? (
          <WarmBody
            api={search}
            candidateId={candidateId}
            domainOptions={domainOptions}
            roleOptions={warmRoleOptions}
            skillOptions={warmSkillOptions}
            profileTitle={profileTitle}
            profileRole={uploaded?.role}
            profileSeniority={uploaded?.seniority}
            isSample={isSample}
            onCandidateGone={onCandidateGone}
            onPickCv={onPickCv}
          />
        ) : (
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
