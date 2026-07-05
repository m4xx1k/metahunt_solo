"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import type { FiltersApi } from "@/features/vacancy-filters/types";
import type { Lens } from "@/lib/hooks/use-analytics";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FeedSearch extends FiltersApi {
  /** Derived from `?cv`: a resolved candidate means the warm lens. */
  lens: Lens;
  /** The active candidate id, or null when browsing cold. */
  cv: string | null;
  /** Set/clear `?cv` shallowly (stays on the current track path). */
  setCv: (id: string | null) => void;
  /** Active track slug from the route (`/<slug>`), or null. */
  track: string | null;
  /** Navigate to a track (or clear it), preserving the query string. */
  setTrack: (slug: string | null) => void;
}

// The feed's URL model over the shared FiltersApi seam: lens derived from `?cv`,
// track from the first path segment, filters in the query string.
export function useFeedSearch(): FeedSearch {
  const filters = useUrlFilters();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const push = useShallowSearchParams();

  const rawCv = searchParams.get("cv");
  // The ?cv capability is a UUID; ignore a malformed value so a garbage link
  // degrades to cold instead of 500-ing the ranking endpoint.
  const cv = rawCv && UUID_RE.test(rawCv) ? rawCv : null;
  const lens: Lens = cv ? "warm" : "cold";
  const track = pathname === "/" ? null : pathname.slice(1).split("/")[0] || null;

  const setCv = useCallback(
    (id: string | null) =>
      push((n) => (id ? n.set("cv", id) : n.delete("cv"))),
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

  return { ...filters, lens, cv, setCv, track, setTrack };
}
