"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import {
  currentReferrerDomain,
  persistFirstTouch,
  readAcquisitionAttribution,
  resolveAttribution,
} from "@/lib/analytics/attribution";
import { redactCvLinks } from "@/lib/analytics/redact-cv-links";

// Client-side product analytics. It is dormant without NEXT_PUBLIC_POSTHOG_KEY.
// Browser events stay anonymous until successful auth identifies with users.id,
// which merges the anonymous history onto the person.
export function PostHogProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    // Runs on every page's first load, independent of the PostHog key: the
    // first-touch store also feeds the first-party ledger's attribution.
    persistFirstTouch(window.location.search);
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      // Same-origin path proxied to PostHog EU by next.config rewrites — keeps
      // events first-party so ad/tracker blockers don't drop them.
      api_host: "/ingest",
      // Real UI host so toolbar / "view in PostHog" links resolve correctly.
      ui_host: "https://eu.posthog.com",
      person_profiles: "identified_only",
      // On load and on every client-side navigation. Pages and clicks are
      // PostHog's job; custom events are for facts it cannot see.
      capture_pageview: "history_change",
      // Anonymous outbound clicks have no users.id, so the server cannot name
      // them. Autocapture gives them an anonymous distinct_id that identify()
      // merges into the person on login — the one path that reaches them.
      autocapture: true,
      sanitize_properties: redactCvLinks,
    });
    // Acquisition rides along on every event as a super property: internal
    // navigation drops the query string, and one channel per person is the
    // question anyway.
    const attribution = resolveAttribution({
      ...readAcquisitionAttribution(
        Object.fromEntries(new URLSearchParams(window.location.search)),
      ),
      ...currentReferrerDomain(),
    });
    if (Object.keys(attribution).length > 0) posthog.register(attribution);
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
