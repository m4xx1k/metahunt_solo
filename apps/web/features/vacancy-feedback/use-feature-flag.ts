"use client";

import { useFeatureFlagEnabled } from "posthog-js/react";

// Boolean view of a PostHog flag: `undefined` (SDK dormant / not yet resolved)
// reads as off, so the gated feature has a safe default. In non-prod, `?ff=<key>`
// (comma-separated) force-enables flags for local QA/preview — dead-code-stripped
// from production builds.
export const useFeatureFlag = (key: string) => {
  const enabled = useFeatureFlagEnabled(key) === true;
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const ff = new URLSearchParams(window.location.search).get("ff");
    if (ff?.split(",").includes(key)) return true;
  }
  return enabled;
};
