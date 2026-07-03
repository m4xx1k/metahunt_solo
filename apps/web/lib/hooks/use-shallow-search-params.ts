"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Commit a query-string mutation WITHOUT an RSC navigation. Next 16 syncs
// `window.history.pushState` with `useSearchParams`, so client components
// re-render and react-query keys flip (refetch client-side) — no server
// round-trip, no double-fetch. Callers own the offset policy: filter changes
// delete ?offset (a new context resets the page); pagination sets it.
export function useShallowSearchParams() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, searchParams],
  );
}
