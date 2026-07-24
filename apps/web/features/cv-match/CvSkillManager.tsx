"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { cvApi, type CvIngestResult, type SkillSuggestion } from "@/lib/api/cv";
import { facetsApi } from "@/lib/api/facets";
import type { SkillRef } from "@/lib/api/ranking";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";

type HeldSkill = Pick<SkillRef, "id" | "name">;

const SEARCH_MAX = 8;

// UI strings only — /me keeps the feed's English, /match speaks Ukrainian.
export interface CvSkillManagerCopy {
  title: string;
  loading: string;
  empty: string;
  searchPlaceholder: string;
  noMatches: string;
  suggestionsTitle: string;
}

const DEFAULT_COPY: CvSkillManagerCopy = {
  title: "my skills",
  loading: "loading skills…",
  empty: "no skills yet",
  searchPlaceholder: "add a skill…",
  noMatches: "no matches",
  suggestionsTitle: "suggestions",
};

// Self-service skill editor for the active CV: remove a held skill, search the
// verified catalog to add one, or act on an implied-skill suggestion right
// there. Owns its own current-skills cache (seeded from GET /cv/:id) so every
// mutation can optimistically patch it from the fetcher's returned set, no
// separate refetch needed.
export function CvSkillManager({
  candidateId,
  copy = DEFAULT_COPY,
  className,
}: {
  candidateId: string;
  copy?: CvSkillManagerCopy;
  className?: string;
}) {
  const qc = useQueryClient();
  const cvKey = ["cv", candidateId] as const;

  const { data: cv, isLoading } = useQuery({
    queryKey: cvKey,
    queryFn: () => cvApi.get(candidateId),
  });
  const { data: suggestions } = useQuery({
    queryKey: ["skill-suggestions", candidateId],
    queryFn: () => cvApi.skillSuggestions(candidateId),
    staleTime: 30_000,
  });
  const { data: catalog } = useQuery({
    queryKey: ["skills-catalog"],
    queryFn: () => facetsApi.skills(),
    staleTime: 60_000,
  });

  const [hiddenSuggestionIds, setHiddenSuggestionIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const invalidateMatch = () => void qc.invalidateQueries({ queryKey: ["match", candidateId] });

  const addSkill = useMutation({
    mutationFn: (s: { nodeId: string; name: string }) => cvApi.confirmSkill(candidateId, s.nodeId),
    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: cvKey });
      const prev = qc.getQueryData<CvIngestResult>(cvKey);
      qc.setQueryData<CvIngestResult>(cvKey, (old) =>
        old ? { ...old, matched: [...old.matched, { id: s.nodeId, name: s.name }] } : old,
      );
      setHiddenSuggestionIds((h) => new Set(h).add(s.nodeId));
      setQuery("");
      return { prev };
    },
    onError: (_err, s, ctx) => {
      if (ctx?.prev) qc.setQueryData(cvKey, ctx.prev);
      setHiddenSuggestionIds((h) => {
        const next = new Set(h);
        next.delete(s.nodeId);
        return next;
      });
      toast.error(`Couldn't add "${s.name}"`);
    },
    onSuccess: (data) => {
      qc.setQueryData<CvIngestResult>(cvKey, (old) => (old ? { ...old, matched: data } : old));
    },
    onSettled: invalidateMatch,
  });

  const removeSkill = useMutation({
    mutationFn: (s: HeldSkill) => cvApi.removeSkill(candidateId, s.id),
    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: cvKey });
      const prev = qc.getQueryData<CvIngestResult>(cvKey);
      qc.setQueryData<CvIngestResult>(cvKey, (old) =>
        old ? { ...old, matched: old.matched.filter((m) => m.id !== s.id) } : old,
      );
      return { prev };
    },
    onError: (_err, s, ctx) => {
      if (ctx?.prev) qc.setQueryData(cvKey, ctx.prev);
      toast.error(`Couldn't remove "${s.name}"`);
    },
    onSuccess: (data) => {
      qc.setQueryData<CvIngestResult>(cvKey, (old) => (old ? { ...old, matched: data } : old));
    },
    onSettled: invalidateMatch,
  });

  const rejectSuggestion = useMutation({
    mutationFn: (s: SkillSuggestion) => cvApi.rejectSkill(candidateId, s.nodeId),
    onMutate: (s) => setHiddenSuggestionIds((h) => new Set(h).add(s.nodeId)),
    onError: (_err, s) => {
      setHiddenSuggestionIds((h) => {
        const next = new Set(h);
        next.delete(s.nodeId);
        return next;
      });
      toast.error(`Couldn't dismiss "${s.name}"`);
    },
  });

  const heldSkills = cv?.matched ?? [];
  // Catalog ids are slugs (facetsApi.skills()); held ids are node UUIDs
  // (cvApi.get) — no shared id space, so dedupe the search results by name.
  const heldNames = new Set(heldSkills.map((s) => s.name.toLowerCase()));
  const visibleSuggestions = (suggestions ?? []).filter((s) => !hiddenSuggestionIds.has(s.nodeId));

  const q = query.trim().toLowerCase();
  const searchResults =
    q.length === 0
      ? []
      : (catalog?.skills ?? [])
          .filter((s) => !heldNames.has(s.name.toLowerCase()) && s.name.toLowerCase().includes(q))
          .slice(0, SEARCH_MAX);

  const busy = addSkill.isPending || removeSkill.isPending || rejectSuggestion.isPending;

  if (isLoading) {
    return (
      <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">{copy.loading}</p>
    );
  }
  if (!cv) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 border border-border bg-bg-card p-4 shadow-brut-sm",
        className,
      )}
    >
      <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">{copy.title}</p>

      <div className="flex flex-wrap gap-1.5">
        {heldSkills.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">{copy.empty}</p>
        ) : (
          heldSkills.map((s) => (
            <span key={s.id} className="inline-flex items-stretch border border-border">
              <span className="px-1.5 py-[1px] font-mono text-xs text-text-secondary">
                {s.name.toLowerCase()}
              </span>
              <button
                type="button"
                onClick={() => removeSkill.mutate(s)}
                disabled={busy}
                aria-label={`Remove ${s.name}`}
                className="border-l border-border px-1 font-mono text-xs text-text-muted transition-colors hover:text-text-secondary disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.searchPlaceholder}
          className="w-full border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {q.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-border bg-bg-card shadow-brut-sm">
            {searchResults.length === 0 ? (
              <li className="px-3 py-1.5 font-mono text-xs text-text-muted">{copy.noMatches}</li>
            ) : (
              searchResults.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => addSkill.mutate({ nodeId: r.id, name: r.name })}
                    disabled={busy}
                    className="block w-full px-3 py-1.5 text-left font-mono text-xs text-text-secondary transition-colors hover:bg-bg hover:text-accent disabled:opacity-50"
                  >
                    {r.name.toLowerCase()}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {visibleSuggestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            {copy.suggestionsTitle}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleSuggestions.map((s) => (
              <Tooltip key={s.nodeId}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-stretch border border-dashed border-border-strong">
                    <button
                      type="button"
                      onClick={() => addSkill.mutate({ nodeId: s.nodeId, name: s.name })}
                      disabled={busy}
                      className="px-1.5 py-[1px] font-mono text-xs text-text-secondary transition-colors hover:text-accent disabled:opacity-50"
                    >
                      + {s.name.toLowerCase()}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectSuggestion.mutate(s)}
                      disabled={busy}
                      aria-label={`Dismiss ${s.name}`}
                      className="border-l border-dashed border-border-strong px-1 font-mono text-xs text-text-muted transition-colors hover:text-text-secondary disabled:opacity-50"
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
    </div>
  );
}
