"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { cvApi } from "@/lib/api/cv";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";

// Role suggestions for the active candidate + the warm-feed default: when the
// URL carries no explicit ?roles, preselect the top-3 suggested role slugs.
// Applied once per candidate — clearing the chips must not resurrect them.
// A reduced (low-signal) result never preselects: rough guesses stay opt-in.
export function useRoleSuggestions(candidateId: string, isSample: boolean) {
  const { data } = useQuery({
    queryKey: ["role-suggestions", candidateId],
    queryFn: () =>
      isSample ? cvApi.sampleRoleSuggestions(candidateId) : cvApi.roleSuggestions(candidateId),
    staleTime: 30_000,
  });

  const searchParams = useSearchParams();
  const push = useShallowSearchParams();
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || appliedFor.current === candidateId) return;
    appliedFor.current = candidateId;
    if (data.reduced || searchParams.has("roles")) return;
    const slugs = data.items.slice(0, 3).map((s) => s.slug ?? s.roleId);
    if (slugs.length > 0) push((next) => next.set("roles", slugs.join(",")));
  }, [data, candidateId, searchParams, push]);

  return data;
}
