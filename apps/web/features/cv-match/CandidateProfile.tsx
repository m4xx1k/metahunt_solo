"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cvApi, type SkillSuggestion } from "@/lib/api/cv";
import type { SkillRef } from "@/lib/api/ranking";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

// What the engine understood about the candidate, shown as a right-rail panel so
// the user can sanity-check the extraction before trusting the ranking: role +
// seniority (uploaded CV), the skills that resolved onto the taxonomy (sorted by
// IDF weight — rarest/strongest first), anything that didn't map, and skills
// probably held but not listed (implied by ones they did list).
export function CandidateProfile({
  candidateId,
  title,
  role,
  seniority,
  matched,
  unmatched,
  totalVacancies,
  isSample = false,
}: {
  candidateId: string;
  title: string;
  role?: string | null;
  seniority?: string | null;
  matched: SkillRef[];
  unmatched: string[];
  totalVacancies: number;
  isSample?: boolean;
}) {
  const qc = useQueryClient();
  // Samples are shared seeded demos — confirming a skill would mutate them for
  // every visitor, so the suggestion feature is owner-scoped (off for samples).
  const { data: suggestions } = useQuery({
    queryKey: ["skill-suggestions", candidateId],
    queryFn: () => cvApi.skillSuggestions(candidateId),
    staleTime: 30_000,
    enabled: !isSample,
  });

  // Hidden the instant a chip is tapped (optimistic); reverted only on error.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Mirrors the tapped suggestion into the skills list immediately, ahead of
  // the refetch that will eventually carry it in `matched`.
  const [confirmed, setConfirmed] = useState<SkillSuggestion[]>([]);

  const confirmSkill = useMutation({
    mutationFn: (s: SkillSuggestion) => cvApi.confirmSkill(candidateId, s.nodeId),
    onMutate: (s) => {
      setHiddenIds((prev) => new Set(prev).add(s.nodeId));
      setConfirmed((prev) => [...prev, s]);
    },
    onError: (_err, s) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(s.nodeId);
        return next;
      });
      setConfirmed((prev) => prev.filter((c) => c.nodeId !== s.nodeId));
      toast.error(`Couldn't confirm "${s.name}"`);
    },
    onSuccess: () => {
      // Re-rank the feed against the now-larger skill set.
      void qc.invalidateQueries({ queryKey: ["match", candidateId] });
    },
  });

  // Dismisses a suggestion for good — no skill-set change, so no re-rank needed.
  const rejectSkill = useMutation({
    mutationFn: (s: SkillSuggestion) => cvApi.rejectSkill(candidateId, s.nodeId),
    onMutate: (s) => {
      setHiddenIds((prev) => new Set(prev).add(s.nodeId));
    },
    onError: (_err, s) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(s.nodeId);
        return next;
      });
      toast.error(`Couldn't dismiss "${s.name}"`);
    },
  });

  const visibleSuggestions = (suggestions ?? []).filter((s) => !hiddenIds.has(s.nodeId));

  // Popular skills first: a lower IDF weight means a higher df — more vacancies
  // want it. weight 0 = the skill is on no vacancy (df=0), so it's not popular,
  // just unknown → push it to the end rather than the front. Optimistically
  // confirmed suggestions land there too, until the refetch gives them a weight
  // — filtered against `matched` so a confirm that already landed (the `/matches`
  // refetch the invalidate triggers) doesn't render twice.
  const matchedIds = new Set(matched.map((m) => m.id));
  const skills = [
    ...matched,
    ...confirmed
      .filter((s) => !matchedIds.has(s.nodeId))
      .map((s) => ({ id: s.nodeId, name: s.name, weight: 0 })),
  ].sort((a, b) => (a.weight || Infinity) - (b.weight || Infinity));
  const SHOWN = 24;
  const extra = skills.length - SHOWN;

  return (
    <div className="border border-border bg-bg-card">
      <div className="h-1 bg-accent" />
      <div className="flex flex-col gap-4 px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">{title}</p>
          {role ? (
            <p className="mt-1.5 font-mono text-lg font-bold leading-tight text-text-primary">
              {role}
            </p>
          ) : null}
          {seniority ? (
            <span className="mt-2 inline-block border border-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-text-secondary">
              {seniority.toLowerCase()}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-px border border-border bg-border">
          <Stat value={matched.length} label="skills" tone="text-success" />
          <Stat value={totalVacancies} label="jobs" tone="text-accent" />
        </div>
        {unmatched.length > 0 ? (
          <p className="-mt-2 font-mono text-[10px] text-text-muted">
            {unmatched.length} unrecognized
          </p>
        ) : null}

        {skills.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">skills</p>
            <div className="flex flex-wrap gap-1.5">
              {skills.slice(0, SHOWN).map((s) => (
                <span
                  key={s.id}
                  className="border border-border px-1.5 py-[1px] font-mono text-[11px] text-text-secondary"
                >
                  {s.name.toLowerCase()}
                </span>
              ))}
              {extra > 0 ? (
                <span className="px-1 font-mono text-[11px] text-text-muted">+{extra}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {visibleSuggestions.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              you probably also know:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {visibleSuggestions.map((s) => (
                <Tooltip key={s.nodeId}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-stretch border border-dashed border-border-strong">
                      <button
                        type="button"
                        onClick={() => confirmSkill.mutate(s)}
                        disabled={confirmSkill.isPending || rejectSkill.isPending}
                        className="px-1.5 py-[1px] font-mono text-[11px] text-text-secondary transition-colors hover:text-accent disabled:opacity-50"
                      >
                        + {s.name.toLowerCase()}
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectSkill.mutate(s)}
                        disabled={confirmSkill.isPending || rejectSkill.isPending}
                        aria-label={`Dismiss ${s.name}`}
                        className="border-l border-dashed border-border-strong px-1 font-mono text-[11px] text-text-muted transition-colors hover:text-text-secondary disabled:opacity-50"
                      >
                        ×
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>implied by {s.impliedBy}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        ) : null}

        {unmatched.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              not in taxonomy
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unmatched.slice(0, 10).map((s) => (
                <span
                  key={s}
                  className="border border-dashed border-border px-1.5 py-[1px] font-mono text-[11px] text-text-muted"
                >
                  {s.toLowerCase()}
                </span>
              ))}
              {unmatched.length > 10 ? (
                <span className="px-1 font-mono text-[11px] text-text-muted">
                  +{unmatched.length - 10}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-bg-card px-3 py-3">
      <span className={`font-mono text-2xl font-bold leading-none ${tone}`}>{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
    </div>
  );
}
