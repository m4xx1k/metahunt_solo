"use client";

import { useQuery } from "@tanstack/react-query";

import { cvApi } from "@/lib/api/cv";

// Role fit for the active candidate — feeds the role picker (suggested roles
// lead with an honest "N/M fit" numerator, see FeedFilters). It does NOT touch
// the URL: picking a role is the user's call, not a passive side effect of
// opening the feed.
export function useRoleSuggestions(candidateId: string, isSample: boolean) {
  const { data } = useQuery({
    queryKey: ["role-suggestions", candidateId],
    queryFn: () =>
      isSample ? cvApi.sampleRoleSuggestions(candidateId) : cvApi.roleSuggestions(candidateId),
    enabled: candidateId !== "",
    staleTime: 30_000,
  });
  return data;
}
