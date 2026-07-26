"use client";

import { useEffect, useRef } from "react";

import { useAnalytics, type AcquisitionAttribution } from "@/lib/analytics/use-analytics";

// The discipline picker has no SubscribeCta (which fires landing_view on the
// track pages), yet it's where tagged campaign links point — without this the
// whole visit is invisible until a track is chosen.
export function LandingViewTracker({
  variant,
  attribution,
}: {
  variant: string;
  attribution: AcquisitionAttribution;
}) {
  const analytics = useAnalytics();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    analytics.landingViewed(variant, attribution);
  }, [analytics, variant, attribution]);

  return null;
}
