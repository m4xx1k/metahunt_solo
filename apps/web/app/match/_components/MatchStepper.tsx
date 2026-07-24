"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr";

import { SubscribeCta } from "@/features/subscribe/SubscribeCta";
import { cvApi, type CvIngestResult } from "@/lib/api/cv";
import { useAnalytics, type AcquisitionAttribution } from "@/lib/hooks/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

import { MOCK_ROLE_SUGGESTIONS } from "./_mocks";
import { MATCH_STEPS, type MatchStep, type SkillPick } from "./flow";
import { StepCv } from "./StepCv";
import { StepExcludes } from "./StepExcludes";
import { StepRoles } from "./StepRoles";
import { StepSkills } from "./StepSkills";

const STEP_TITLES: Record<MatchStep, string> = {
  cv: "Почни з CV — або без нього",
  skills: "Це твій стек?",
  roles: "Де твої навички потрібні",
  excludes: "Чого НЕ хочеш у вакансіях?",
};

// The /match onboarding island. Step lives in ?step= (shallow pushState, so
// browser back walks the flow); the profile state lives here: a stored
// candidate for the CV path, local picks for the manual path. Roles/excludes
// selections are local-only until their matcher-side PRs land.
export function MatchStepper({ attribution }: { attribution: AcquisitionAttribution }) {
  const analytics = useAnalytics();
  const saved = useSaved();
  const push = useShallowSearchParams();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);

  const [ingest, setIngest] = useState<CvIngestResult | null>(null);
  const [manual, setManual] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [manualSkills, setManualSkills] = useState<SkillPick[]>([]);
  const [roleSlugs, setRoleSlugs] = useState<Set<string>>(
    () => new Set(MOCK_ROLE_SUGGESTIONS.filter((r) => r.preselected).map((r) => r.slug)),
  );
  const [excludes, setExcludes] = useState<SkillPick[]>([]);

  const impressionSent = useRef(false);
  useEffect(() => {
    if (impressionSent.current) return;
    impressionSent.current = true;
    analytics.landingViewed("match", attribution);
  }, [analytics, attribution]);

  // The candidate is component state, so a reload with a stale ?step= lands
  // back on the entry step instead of an empty flow.
  const started = ingest !== null || manual;
  const urlStep = searchParams.get("step");
  const step: MatchStep =
    started && (urlStep === "skills" || urlStep === "roles" || urlStep === "excludes")
      ? urlStep
      : "cv";

  const candidateId = ingest?.candidateId ?? null;
  // Same cache key CvSkillManager mutates, so the count/own-skills views here
  // follow every add/remove without a second fetch.
  const { data: cvData } = useQuery({
    queryKey: ["cv", candidateId],
    queryFn: () => cvApi.get(candidateId as string),
    enabled: candidateId != null,
    initialData: ingest ?? undefined,
  });

  const skillCount = candidateId ? (cvData?.matched.length ?? 0) : manualSkills.length;
  const ownSkills: SkillPick[] = candidateId ? (cvData?.matched ?? []) : manualSkills;

  const goTo = useCallback(
    (s: MatchStep) => {
      push((n) => (s === "cv" ? n.delete("step") : n.set("step", s)));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      rootRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },
    [push],
  );

  const onFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setUploading(true);
      analytics.cvUploadStarted();
      try {
        const info = await cvApi.uploadFile(file);
        analytics.cvUpload(info.reused);
        saved.addCv({
          candidateId: info.candidateId,
          label: info.role ?? "Your CV",
          addedAt: Date.now(),
        });
        setIngest(info);
        analytics.matchFlowStarted("cv");
        goTo("skills");
      } catch (e) {
        analytics.cvUploadFailed();
        setUploadError(e instanceof Error ? e.message : "Не вдалося обробити файл");
      } finally {
        setUploading(false);
      }
    },
    [analytics, saved, goTo],
  );

  const onManual = useCallback(() => {
    setManual(true);
    analytics.matchFlowStarted("manual");
    goTo("skills");
  }, [analytics, goTo]);

  const stepIndex = MATCH_STEPS.findIndex((s) => s.key === step);
  const next = () => goTo(MATCH_STEPS[stepIndex + 1]!.key);
  const back = () => goTo(MATCH_STEPS[stepIndex - 1]!.key);

  const feedHref = candidateId
    ? `/?cv=${candidateId}`
    : manualSkills.length > 0
      ? `/?skills=${manualSkills.map((s) => s.id).join(",")}`
      : "/";

  const onComplete = () =>
    analytics.matchFlowCompleted({
      has_cv: candidateId != null,
      skills_count: skillCount,
      roles_count: roleSlugs.size,
      excludes_count: excludes.length,
    });

  return (
    <div ref={rootRef} className="flex scroll-mt-24 flex-col gap-5">
      <StepRail current={stepIndex} started={started} onSelect={goTo} />

      <div className="border border-border bg-bg-card shadow-brut-lg">
        <div className="h-1 bg-accent" />
        <div className="flex flex-col gap-5 p-5 sm:p-8">
          <h2 className="font-display text-2xl font-bold leading-tight text-text-primary">
            {STEP_TITLES[step]}
          </h2>

          {step === "cv" ? (
            <StepCv
              ingest={ingest}
              uploading={uploading}
              error={uploadError}
              onFile={onFile}
              onManual={onManual}
              onNext={() => goTo("skills")}
            />
          ) : step === "skills" ? (
            <StepSkills
              candidateId={candidateId}
              unmatched={cvData?.unmatched ?? []}
              skillCount={skillCount}
              manualSkills={manualSkills}
              onManualSkillsChange={setManualSkills}
            />
          ) : step === "roles" ? (
            <StepRoles
              selected={roleSlugs}
              onToggle={(slug) =>
                setRoleSlugs((prev) => {
                  const nextSet = new Set(prev);
                  if (nextSet.has(slug)) nextSet.delete(slug);
                  else nextSet.add(slug);
                  return nextSet;
                })
              }
            />
          ) : (
            <StepExcludes excludes={excludes} onChange={setExcludes} ownSkills={ownSkills} />
          )}

          {step === "skills" || step === "roles" ? (
            <div className="flex flex-col-reverse items-stretch gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={back}
                className="px-2 py-2 text-left font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent sm:py-0"
              >
                ← назад
              </button>
              <div className="flex flex-col-reverse items-stretch gap-3 sm:ml-auto sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={next}
                  className="px-2 py-2 font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent sm:py-0"
                >
                  Пропустити
                </button>
                <Button size="md" onClick={next} className="w-full sm:w-auto">
                  Далі →
                </Button>
              </div>
            </div>
          ) : null}

          {step === "excludes" ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={back}
                  className="px-2 py-2 text-left font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent sm:py-0"
                >
                  ← назад
                </button>
                <Link href={feedHref} onClick={onComplete} className="sm:ml-auto">
                  <Button size="lg" className="w-full">
                    Показати мої вакансії →
                  </Button>
                </Link>
              </div>
              {candidateId == null && manualSkills.length > 0 ? (
                <div className="flex flex-col gap-2 sm:items-end">
                  <SubscribeCta
                    landingVariant="match_manual"
                    params={{
                      skillIds: manualSkills.map((s) => s.id),
                      postedWithinDays: 30,
                    }}
                    attribution={attribution}
                    label="Отримувати нові в Telegram →"
                  />
                  <p className="font-mono text-[10px] text-text-muted">
                    підписка на обрані навички · без спаму, тільки збіги
                  </p>
                </div>
              ) : (
                <p className="font-mono text-[10px] text-text-muted sm:text-right">
                  Telegram-дайджест — у стрічці, одразу над результатами
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Progress rail: visited steps are clickable (revise a choice), future steps
// unlock by walking forward.
function StepRail({
  current,
  started,
  onSelect,
}: {
  current: number;
  started: boolean;
  onSelect: (s: MatchStep) => void;
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {MATCH_STEPS.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        const clickable = started && i < current;
        return (
          <li key={s.key} className={cn("flex items-center gap-2 sm:gap-3", i > 0 && "flex-1")}>
            {i > 0 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
            <button
              type="button"
              onClick={clickable ? () => onSelect(s.key) : undefined}
              disabled={!clickable}
              aria-current={state === "active" ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider",
                state === "active" && "text-accent",
                state === "done" && "text-success",
                state === "todo" && "text-text-muted",
                clickable && "transition-colors hover:text-accent",
                !clickable && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center border text-[10px]",
                  state === "active" && "border-accent",
                  state === "done" && "border-success",
                  state === "todo" && "border-border",
                )}
              >
                {state === "done" ? <CheckIcon className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
