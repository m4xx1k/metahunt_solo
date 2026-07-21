import { useMemo } from "react";
import { usePostHog } from "posthog-js/react";

import type { CvMatchParams, SubscriptionParams } from "@/lib/api/subscriptions";

// Single source of truth for client-side event names (mirrors the backend
// events.ts) — no event-name string literals in components.
const ANALYTICS_EVENTS = {
  subscribeClicked: "subscribe_clicked",
  lensSwitch: "lens_switch",
  cvUpload: "cv_upload",
  loggedIn: "logged_in",
  vacancyFeedback: "vacancy_feedback",
  baitClick: "bait_click",
} as const;

export type Lens = "cold" | "warm";

// The single client-side analytics seam — domain methods only, so components
// never touch raw event names or the PostHog client (mirrors the backend
// AnalyticsService). No-ops when PostHog is dormant (no NEXT_PUBLIC_POSTHOG_KEY).
// Memoised on the stable client so the returned object is referentially stable
// across renders (safe to list in a useCallback/useEffect dependency array).
export function useAnalytics() {
  const posthog = usePostHog();

  return useMemo(
    () => ({
      subscriptionCreated(subscriptionUuid: string, params: SubscriptionParams | CvMatchParams) {
        posthog?.capture(ANALYTICS_EVENTS.subscribeClicked, {
          filterCount: Object.keys(params).length,
        });
        posthog?.alias(subscriptionUuid);
      },

      // The visitor toggled the feed/CV lens. `to` is the lens now shown.
      lensSwitched(from: Lens, to: Lens) {
        posthog?.capture(ANALYTICS_EVENTS.lensSwitch, { from, to });
      },

      // A CV was uploaded and resolved to a candidate (the warm-lens entry).
      // The candidateId is a shareable bearer capability, so it is deliberately
      // NOT sent as a property.
      cvUpload(reused: boolean) {
        posthog?.capture(ANALYTICS_EVENTS.cvUpload, { reused });
      },

      loggedIn(userId: string) {
        posthog?.identify(userId, { login_method: "telegram" });
        posthog?.capture(ANALYTICS_EVENTS.loggedIn, { method: "telegram" });
      },

      // Up/down vote on a vacancy card (demand signal, gated by the
      // feedback-buttons flag). Fired once per real sentiment change.
      vacancyFeedback(vacancyId: string, sentiment: "up" | "down") {
        posthog?.capture(ANALYTICS_EVENTS.vacancyFeedback, {
          vacancy_id: vacancyId,
          sentiment,
        });
      },

      // Tapped a not-yet-built AI helper (cover letter / CV tuning) — measures
      // demand before we build it. vacancyId is absent for the CV-level bait.
      baitClick(feature: "cover_letter" | "tune_cv", vacancyId?: string) {
        posthog?.capture(ANALYTICS_EVENTS.baitClick, {
          feature,
          vacancy_id: vacancyId,
        });
      },
    }),
    [posthog],
  );
}
