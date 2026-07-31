"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { readAcquisitionAttribution } from "@/lib/analytics/attribution";
import { useAnalytics } from "@/lib/analytics/use-analytics";

export function pageTypeForPath(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname === "/radar") return "radar_index";
  if (pathname.startsWith("/radar/")) return "radar_track";
  if (pathname === "/match") return "match";
  if (pathname.startsWith("/vacancy/")) return "vacancy_detail";
  if (pathname.startsWith("/dashboard")) return "operator";
  if (pathname.startsWith("/me")) return "account";
  return "other";
}

export function PageViewTracker() {
  const pathname = usePathname() ?? "/";
  const analytics = useAnalytics();

  useEffect(() => {
    analytics.pageViewed(
      pageTypeForPath(pathname),
      readAcquisitionAttribution(Object.fromEntries(new URLSearchParams(window.location.search))),
    );
  }, [analytics, pathname]);

  return null;
}
