"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Typed wrapper around `useSearchParams`/`useRouter` for the taxonomy
// workspace. The filters and the selected node id are all URL-driven so
// reloads, deep-links, and back/forward all just work — this hook is the
// single place that knows how to merge a partial patch into the existing
// query string without losing unrelated keys.
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, sp, pathname],
  );

  return { sp, update };
}
