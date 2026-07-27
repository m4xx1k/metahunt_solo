import { useMemo } from "react";
import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js";

import { resolveAttribution, type AcquisitionAttribution } from "@/lib/analytics/attribution";
import { getOrCreateJourneyId } from "@/lib/analytics/journey";
import { analyticsApi, type BrowserAnalyticsEventName } from "@/lib/api/analytics";
import type { CvMatchParams, SubscriptionParams } from "@/lib/api/subscriptions";

export type { AcquisitionAttribution } from "@/lib/analytics/attribution";

// Single source of truth for client-side event names (mirrors the backend
// events.ts) — no event-name string literals in components.
const ANALYTICS_EVENTS = {
  landingView: "landing_view",
  landingCtaClicked: "landing_cta_clicked",
  subscriptionCreateStarted: "subscription_create_started",
  subscriptionHandoffOpened: "subscription_handoff_opened",
  subscriptionCreateFailed: "subscription_create_failed",
  lensSwitch: "lens_switch",
  cvUploadStarted: "cv_upload_started",
  cvUploadCompleted: "cv_upload_completed",
  cvUploadFailed: "cv_upload_failed",
  telegramLoginStarted: "telegram_login_started",
  telegramLoginCancelled: "telegram_login_cancelled",
  telegramLoginFailed: "telegram_login_failed",
  googleLoginFailed: "google_login_failed",
  loggedIn: "logged_in",
  signup: "signup",
  vacancyFeedback: "vacancy_feedback",
  baitClick: "bait_click",
  matchFlowStarted: "match_flow_started",
  matchFlowCompleted: "match_flow_completed",
} as const;

export type Lens = "cold" | "warm";
export type TelegramLoginMethod = "deeplink" | "widget";
export type LoginProvider = "telegram" | "google";
export type SubscriptionProfile = "feed" | "cv";

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
      // Attribution falls back to the stored first touch when the current URL
      // carries no tags — internal navigation drops the query string.
      landingViewed(variant: string, attribution: AcquisitionAttribution) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.landingView, {
          landing_variant: variant,
          path: window.location.pathname,
          ...resolveAttribution(attribution),
        });
      },

      landingCtaClicked(variant: string, attribution: AcquisitionAttribution) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.landingCtaClicked, {
          landing_variant: variant,
          destination: "telegram_subscription",
          ...resolveAttribution(attribution),
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
      },

      cvUploadFailed() {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.cvUploadFailed);
      },

      // `method` splits the bot deep-link flow from the legacy widget, so the
      // two can be compared on the same funnel while both are live.
      telegramLoginStarted(method: TelegramLoginMethod) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginStarted, { method });
      },

      // ms_since_start separates a human closing the popup (seconds) from a
      // popup that never opened — blocker or widget failure (sub-second).
      telegramLoginCancelled(msSinceStart: number, method: TelegramLoginMethod) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginCancelled, {
          ms_since_start: msSinceStart,
          method,
        });
      },

      telegramLoginFailed(
        stage: "configuration" | "widget" | "session" | "expired",
        method: TelegramLoginMethod,
      ) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginFailed, { stage, method });
      },

      googleLoginFailed(stage: "widget" | "session") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.googleLoginFailed, { stage });
      },

      loggedIn(provider: LoginProvider) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.loggedIn, {
          login_method: provider,
        });
      },

      // Fired once per account, on the first-ever login through any provider
      // (the server says whether the user row was just created).
      signedUp(provider: LoginProvider) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.signup, { method: provider });
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

      // /match onboarding funnel: started = the visitor committed to a path.
      matchFlowStarted(entry: "cv" | "manual") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.matchFlowStarted, { entry });
      },

      matchFlowCompleted(props: {
        has_cv: boolean;
        skills_count: number;
        roles_count: number;
        excludes_count: number;
      }) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.matchFlowCompleted, props);
      },
    }),
    [posthog],
  );
}
