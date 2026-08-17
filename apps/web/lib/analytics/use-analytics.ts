import { useMemo } from "react";
import { usePostHog } from "posthog-js/react";
import type { PostHog } from "posthog-js";

export type { AcquisitionAttribution } from "@/lib/analytics/attribution";

// Client-side event names (mirrored in the backend's events.ts, checked by
// `pnpm analytics:catalog`) — no event-name string literals in components.
// Every name here is a verb whose outcome an outsider watching URLs and clicks
// could not infer; pages and plain clicks belong to $pageview and autocapture.
const ANALYTICS_EVENTS = {
  subscriptionCreateFailed: "subscription_create_failed",
  cvUploadCompleted: "cv_upload_completed",
  cvUploadFailed: "cv_upload_failed",
  telegramLoginCancelled: "telegram_login_cancelled",
  telegramLoginFailed: "telegram_login_failed",
  googleLoginFailed: "google_login_failed",
  identityLinked: "identity_linked",
  identityUnlinked: "identity_unlinked",
  identityLinkConflict: "identity_link_conflict",
  vacancyFeedback: "vacancy_feedback",
  baitClick: "bait_click",
  matchFlowCompleted: "match_flow_completed",
  feedScoreLocked: "feed_score_locked",
} as const;

// The feed lens, kept here because it predates any better home.
export type Lens = "cold" | "warm";
export type TelegramLoginMethod = "deeplink";
export type LoginProvider = "telegram" | "google";
export type SubscriptionProfile = "feed" | "cv";

type AnalyticsProperty = string | number | boolean | undefined;
const IS_TEST_TRAFFIC = process.env.NEXT_PUBLIC_ANALYTICS_TEST_TRAFFIC === "true";

function capture(
  posthog: PostHog | undefined,
  name: string,
  properties?: Record<string, AnalyticsProperty>,
): void {
  posthog?.capture(name, { ...properties, is_test: IS_TEST_TRAFFIC });
}

export function useAnalytics() {
  const posthog = usePostHog();

  return useMemo(
    () => ({
      identifyAccount(userId: string) {
        posthog?.identify(userId);
      },

      subscriptionCreateFailed(profile: SubscriptionProfile) {
        capture(posthog, ANALYTICS_EVENTS.subscriptionCreateFailed, { profile_type: profile });
      },

      // The candidateId is a shareable bearer capability, so it is deliberately
      // NOT sent as a property.
      cvUpload(reused: boolean) {
        capture(posthog, ANALYTICS_EVENTS.cvUploadCompleted, { reused });
      },

      cvUploadFailed() {
        capture(posthog, ANALYTICS_EVENTS.cvUploadFailed);
      },

      telegramLoginCancelled(msSinceStart: number, method: TelegramLoginMethod) {
        capture(posthog, ANALYTICS_EVENTS.telegramLoginCancelled, {
          ms_since_start: msSinceStart,
          method,
        });
      },

      telegramLoginFailed(
        stage: "configuration" | "session" | "expired",
        method: TelegramLoginMethod,
      ) {
        capture(posthog, ANALYTICS_EVENTS.telegramLoginFailed, { stage, method });
      },

      googleLoginFailed(stage: "widget" | "session") {
        capture(posthog, ANALYTICS_EVENTS.googleLoginFailed, { stage });
      },

      identityLinked(provider: LoginProvider) {
        capture(posthog, ANALYTICS_EVENTS.identityLinked, { provider });
      },

      identityUnlinked(provider: LoginProvider) {
        capture(posthog, ANALYTICS_EVENTS.identityUnlinked, { provider });
      },

      identityLinkConflict(provider: LoginProvider) {
        capture(posthog, ANALYTICS_EVENTS.identityLinkConflict, { provider });
      },

      vacancyFeedback(vacancyId: string, sentiment: "up" | "down") {
        capture(posthog, ANALYTICS_EVENTS.vacancyFeedback, {
          vacancy_id: vacancyId,
          sentiment,
        });
      },

      baitClick(feature: "cover_letter" | "tune_cv", vacancyId?: string) {
        capture(posthog, ANALYTICS_EVENTS.baitClick, { feature, vacancy_id: vacancyId });
      },

      // A cold visitor tapped the locked Fit slot on a /feed card. The whole
      // point of showing a locked score is to find out whether the number is
      // what people actually want — this is that measurement.
      feedScoreLocked(vacancyId: string) {
        capture(posthog, ANALYTICS_EVENTS.feedScoreLocked, { vacancy_id: vacancyId });
      },

      matchFlowCompleted(props: {
        has_cv: boolean;
        skills_count: number;
        roles_count: number;
        excludes_count: number;
      }) {
        capture(posthog, ANALYTICS_EVENTS.matchFlowCompleted, props);
      },
    }),
    [posthog],
  );
}
