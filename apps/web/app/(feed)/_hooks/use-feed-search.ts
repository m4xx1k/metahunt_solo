"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import type { FiltersApi } from "@/features/vacancy-filters/types";
import { isUuid } from "@/lib/uuid";

export interface FeedSearch extends FiltersApi {
  /** A seeded sample candidate id, or null. A real CV never lives in the URL
   *  (MET-144 step 7) — the signed-in viewer's active CV resolves from the
   *  JWT; FeedLensShell derives the warm lens from that plus this. */
  sample: string | null;
  /** Set/clear `?sample` shallowly (stays on the current track path). */
  setSample: (id: string | null) => void;
  /** Active track slug from the route (`/<slug>`), or null. */
  track: string | null;
  /** Navigate to a track (or clear it), preserving the query string. */
  setTrack: (slug: string | null) => void;
}

// The feed's URL model over the shared FiltersApi seam: the sample capability
// token, track from the first path segment, filters in the query string.
export function useFeedSearch(): FeedSearch {
  const filters = useUrlFilters();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const push = useShallowSearchParams();

  const rawSample = searchParams.get("sample");
  // The ?sample capability is a UUID; ignore a malformed value so a garbage
  // link degrades to cold instead of 404-ing the feed endpoint.
  const sample = rawSample && isUuid(rawSample) ? rawSample : null;
  const track = pathname === "/" ? null : pathname.slice(1).split("/")[0] || null;

  const setSample = useCallback(
    (id: string | null) => push((n) => (id ? n.set("sample", id) : n.delete("sample"))),
    [push],
  );

  const setTrack = useCallback(
    (slug: string | null) => {
      const base = slug ? `/${encodeURIComponent(slug)}` : "/";
      const qs = searchParams.toString();
      router.push(qs ? `${base}?${qs}` : base);
    },
    [router, searchParams],
  );

  return { ...filters, sample, setSample, track, setTrack };
}
