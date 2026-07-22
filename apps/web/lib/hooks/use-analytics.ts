import { useMemo } from "react";
import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js";

import { getOrCreateJourneyId } from "@/lib/analytics-journey";
import { analyticsApi, type BrowserAnalyticsEventName } from "@/lib/api/analytics";
import type { CvMatchParams, SubscriptionParams } from "@/lib/api/subscriptions";

// Single source of truth for client-side event names (mirrors the backend
// events.ts) — no event-name string literals in components.
const ANALYTICS_EVENTS = {
  landingView: "landing_view",
  landingCtaClicked: "landing_cta_clicked",
  subscriptionCreateStarted: "subscription_create_started",
  subscriptionHandoffOpened: "subscription_handoff_opened",
  subscriptionCreateFailed: "subscription_create_failed",
  subscribeClicked: "subscribe_clicked",
  lensSwitch: "lens_switch",
  cvUploadStarted: "cv_upload_started",
  cvUploadCompleted: "cv_upload_completed",
  cvUploadFailed: "cv_upload_failed",
  cvUpload: "cv_upload",
  telegramLoginStarted: "telegram_login_started",
  telegramLoginCancelled: "telegram_login_cancelled",
  telegramLoginFailed: "telegram_login_failed",
  loggedIn: "logged_in",
  vacancyFeedback: "vacancy_feedback",
  baitClick: "bait_click",
} as const;

export type Lens = "cold" | "warm";
export type SubscriptionProfile = "feed" | "cv";
export type AcquisitionAttribution = Partial<
  Record<
    "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "creative_id",
    string
  >
>;

type AnalyticsProperty = string | number | boolean | undefined;

function identifyJourney(posthog: PostHog | undefined): void {
  posthog?.identify(getOrCreateJourneyId());
}

function captureBrowserEvent(
  posthog: PostHog | undefined,
  name: BrowserAnalyticsEventName,
  properties: Record<string, string | number | boolean>,
): void {
  identifyJourney(posthog);
  void analyticsApi.captureBrowserEvent({ name, properties }).catch(() => undefined);
}

function capturePostHogEvent(
  posthog: PostHog | undefined,
  name: string,
  properties?: Record<string, AnalyticsProperty>,
): void {
  identifyJourney(posthog);
  posthog?.capture(name, properties);
}

// The single client-side analytics seam — domain methods only, so components
// never touch raw event names or the PostHog client (mirrors the backend
// AnalyticsService). No-ops when PostHog is dormant (no NEXT_PUBLIC_POSTHOG_KEY).
// Memoised on the stable client so the returned object is referentially stable
// across renders (safe to list in a useCallback/useEffect dependency array).
export function useAnalytics() {
  const posthog = usePostHog();

  return useMemo(
    () => ({
      landingViewed(variant: string, attribution: AcquisitionAttribution) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.landingView, {
          landing_variant: variant,
          ...attribution,
        });
      },

      landingCtaClicked(variant: string, attribution: AcquisitionAttribution) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.landingCtaClicked, {
          landing_variant: variant,
          destination: "telegram_subscription",
          ...attribution,
        });
      },

      subscriptionCreateStarted(
        profile: SubscriptionProfile,
        params: SubscriptionParams | CvMatchParams,
      ) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.subscriptionCreateStarted, {
          profile_type: profile,
          filter_count: Object.keys(params).length,
        });
      },

      subscriptionCreated(params: SubscriptionParams | CvMatchParams) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.subscribeClicked, {
          filterCount: Object.keys(params).length,
        });
      },

      subscriptionHandoffOpened(profile: SubscriptionProfile) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.subscriptionHandoffOpened, {
          profile_type: profile,
        });
      },

      subscriptionCreateFailed(profile: SubscriptionProfile) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.subscriptionCreateFailed, {
          profile_type: profile,
        });
      },

      // The visitor toggled the feed/CV lens. `to` is the lens now shown.
      lensSwitched(from: Lens, to: Lens) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.lensSwitch, { from, to });
      },

      // A CV was uploaded and resolved to a candidate (the warm-lens entry).
      // The candidateId is a shareable bearer capability, so it is deliberately
      // NOT sent as a property.
      cvUploadStarted() {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.cvUploadStarted);
      },

      cvUpload(reused: boolean) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.cvUploadCompleted, { reused });
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.cvUpload, { reused });
      },

      cvUploadFailed() {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.cvUploadFailed);
      },

      telegramLoginStarted() {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginStarted);
      },

      telegramLoginCancelled() {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginCancelled);
      },

      telegramLoginFailed(stage: "configuration" | "widget" | "session") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginFailed, { stage });
      },

      loggedIn() {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.loggedIn, {
          login_method: "telegram",
          method: "telegram",
        });
      },

      // Up/down vote on a vacancy card (demand signal, gated by the
      // feedback-buttons flag). Fired once per real sentiment change.
      vacancyFeedback(vacancyId: string, sentiment: "up" | "down") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.vacancyFeedback, {
          vacancy_id: vacancyId,
          sentiment,
        });
      },

      // Tapped a not-yet-built AI helper (cover letter / CV tuning) — measures
      // demand before we build it. vacancyId is absent for the CV-level bait.
      baitClick(feature: "cover_letter" | "tune_cv", vacancyId?: string) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.baitClick, {
          feature,
          vacancy_id: vacancyId,
        });
      },
    }),
    [posthog],
  );
}
