"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import type { FiltersApi } from "@/features/vacancy-filters/types";
import type { Lens } from "@/lib/hooks/use-analytics";

const MERGED_BASE = "/merged";

export interface MergedSearch extends FiltersApi {
  /** Derived from `?cv`: a resolved candidate means the warm lens. */
  lens: Lens;
  /** The active candidate id, or null when browsing cold. */
  cv: string | null;
  /** Set/clear `?cv` shallowly (stays on the current track path). */
  setCv: (id: string | null) => void;
  /** Active track slug from the route (`/merged/<slug>`), or null. */
  track: string | null;
  /** Navigate to a track (or clear it), preserving the query string. */
  setTrack: (slug: string | null) => void;
}

// The merged route's URL model over the shared FiltersApi seam: lens derived
// from `?cv`, track from the route segment, filters in the query string.
export function useMergedSearch(): MergedSearch {
  const filters = useUrlFilters();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const push = useShallowSearchParams();

  const cv = searchParams.get("cv");
  const lens: Lens = cv ? "warm" : "cold";
  const track = pathname.startsWith(`${MERGED_BASE}/`)
    ? (pathname.slice(MERGED_BASE.length + 1).split("/")[0] || null)
    : null;

  const setCv = useCallback(
    (id: string | null) =>
      push((n) => (id ? n.set("cv", id) : n.delete("cv"))),
    [push],
  );

  const setTrack = useCallback(
    (slug: string | null) => {
      const base = slug ? `${MERGED_BASE}/${encodeURIComponent(slug)}` : MERGED_BASE;
      const qs = searchParams.toString();
      router.push(qs ? `${base}?${qs}` : base);
    },
    [router, searchParams],
  );

  return { ...filters, lens, cv, setCv, track, setTrack };
}
