"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { meApi } from "@/lib/api/me";
import { mergeCvs } from "@/lib/cv-merge";
import { useSession } from "@/features/auth/use-session";
import { useSaved, type SavedCv } from "@/lib/hooks/use-saved";

// The CV-switcher list. Anonymous uploads live in this browser's localStorage;
// once logged in, the account's server CVs are the cross-device source of truth
// (so phone and laptop show the same set). mergeCvs dedupes the two.
export function useMyCvs(): SavedCv[] {
  const { isLoggedIn } = useSession();
  const { cvs: local } = useSaved();
  const { data: server } = useQuery({
    queryKey: ["me", "cv"],
    queryFn: meApi.listCvs,
    enabled: isLoggedIn,
    staleTime: 60_000,
  });

  return useMemo(() => mergeCvs(server, local), [server, local]);
}
