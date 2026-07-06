"use client";

import { useFeatureFlagEnabled } from "posthog-js/react";

// Boolean view of a PostHog flag: `undefined` (SDK dormant / not yet resolved)
// reads as off, so the gated feature has a safe default.
export const useFeatureFlag = (key: string) =>
  useFeatureFlagEnabled(key) === true;
