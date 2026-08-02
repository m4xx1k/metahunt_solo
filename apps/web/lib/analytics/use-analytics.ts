import { useMemo } from "react";
import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js";

import {
  currentReferrerDomain,
  resolveAttribution,
  type AcquisitionAttribution,
} from "@/lib/analytics/attribution";
import { getOrCreateJourneyId } from "@/lib/analytics/journey";
import { analyticsApi, type BrowserAnalyticsEventName } from "@/lib/api/analytics";
import type { CvMatchParams, SubscriptionParams } from "@/lib/api/subscriptions";

export type { AcquisitionAttribution } from "@/lib/analytics/attribution";

// Single source of truth for client-side event names (mirrors the backend
// events.ts) — no event-name string literals in components.
const ANALYTICS_EVENTS = {
  pageViewed: "page_viewed",
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
  identityLinked: "identity_linked",
  identityUnlinked: "identity_unlinked",
  identityLinkConflict: "identity_link_conflict",
  loggedIn: "logged_in",
  signup: "signup",
  vacancyFeedback: "vacancy_feedback",
  baitClick: "bait_click",
  matchFlowStarted: "match_flow_started",
  matchFlowCompleted: "match_flow_completed",
  feedScoreLocked: "feed_score_locked",
} as const;

export type Lens = "cold" | "warm";
export type TelegramLoginMethod = "deeplink";
export type LoginProvider = "telegram" | "google";
export type SubscriptionProfile = "feed" | "cv";

type AnalyticsProperty = string | number | boolean | undefined;
const IS_TEST_TRAFFIC = process.env.NEXT_PUBLIC_ANALYTICS_TEST_TRAFFIC === "true";

function identifyJourney(posthog: PostHog | undefined): void {
  posthog?.identify(getOrCreateJourneyId());
}

function captureBrowserEvent(
  posthog: PostHog | undefined,
  name: BrowserAnalyticsEventName,
  properties: Record<string, string | number | boolean>,
): void {
  identifyJourney(posthog);
  void analyticsApi
    .captureBrowserEvent({ name, properties: { ...properties, is_test: IS_TEST_TRAFFIC } })
    .catch(() => undefined);
}

function capturePostHogEvent(
  posthog: PostHog | undefined,
  name: string,
  properties?: Record<string, AnalyticsProperty>,
): void {
  identifyJourney(posthog);
  posthog?.capture(name, { ...properties, is_test: IS_TEST_TRAFFIC });
}

export function useAnalytics() {
  const posthog = usePostHog();

  return useMemo(
    () => ({
      identifyPerson(personId: string) {
        const journeyId = getOrCreateJourneyId();
        posthog?.alias(personId, journeyId);
        posthog?.identify(personId);
      },

      pageViewed(pageType: string, attribution: AcquisitionAttribution) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.pageViewed, {
          path: window.location.pathname,
          page_type: pageType,
          ...resolveAttribution({ ...attribution, ...currentReferrerDomain() }),
        });
      },

      // Attribution falls back to the stored first touch when the current URL
      // carries no tags — internal navigation drops the query string.
      landingViewed(variant: string, attribution: AcquisitionAttribution) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.landingView, {
          landing_variant: variant,
          path: window.location.pathname,
          ...resolveAttribution({ ...attribution, ...currentReferrerDomain() }),
        });
      },

      landingCtaClicked(variant: string, attribution: AcquisitionAttribution) {
        captureBrowserEvent(posthog, ANALYTICS_EVENTS.landingCtaClicked, {
          landing_variant: variant,
          destination: "telegram_subscription",
          ...resolveAttribution({ ...attribution, ...currentReferrerDomain() }),
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

      lensSwitched(from: Lens, to: Lens) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.lensSwitch, { from, to });
      },

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

      telegramLoginStarted(method: TelegramLoginMethod) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginStarted, { method });
      },

      telegramLoginCancelled(msSinceStart: number, method: TelegramLoginMethod) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginCancelled, {
          ms_since_start: msSinceStart,
          method,
        });
      },

      telegramLoginFailed(
        stage: "configuration" | "session" | "expired",
        method: TelegramLoginMethod,
      ) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.telegramLoginFailed, { stage, method });
      },

      googleLoginFailed(stage: "widget" | "session") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.googleLoginFailed, { stage });
      },

      identityLinked(provider: LoginProvider) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.identityLinked, { provider });
      },

      identityUnlinked(provider: LoginProvider) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.identityUnlinked, { provider });
      },

      identityLinkConflict(provider: LoginProvider) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.identityLinkConflict, { provider });
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

      vacancyFeedback(vacancyId: string, sentiment: "up" | "down") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.vacancyFeedback, {
          vacancy_id: vacancyId,
          sentiment,
        });
      },

      baitClick(feature: "cover_letter" | "tune_cv", vacancyId?: string) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.baitClick, {
          feature,
          vacancy_id: vacancyId,
        });
      },

      matchFlowStarted(entry: "cv" | "manual") {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.matchFlowStarted, { entry });
      },

      // A cold visitor tapped the locked Fit slot on a /feed card. The whole
      // point of showing a locked score is to find out whether the number is
      // what people actually want — this is that measurement.
      feedScoreLocked(vacancyId: string) {
        capturePostHogEvent(posthog, ANALYTICS_EVENTS.feedScoreLocked, { vacancy_id: vacancyId });
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
