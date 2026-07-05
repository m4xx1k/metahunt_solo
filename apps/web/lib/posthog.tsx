"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

// Client-side PostHog. Dormant without NEXT_PUBLIC_POSTHOG_KEY (mirrors the
// backend AnalyticsService) so local dev ships nothing. `identified_only` keeps
// anonymous browsing from minting person profiles — a person is created only
// once SubscribeButton calls posthog.alias(subscription_uuid), which is the
// seam that stitches this browser session to the cross-context identity.
export function PostHogProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      // Same-origin path proxied to PostHog EU by next.config rewrites — keeps
      // events first-party so ad/tracker blockers don't drop them.
      api_host: "/ingest",
      // Real UI host so toolbar / "view in PostHog" links resolve correctly.
      ui_host: "https://eu.posthog.com",
      person_profiles: "identified_only",
      // The shareable ?cv=<uuid> is a bearer capability — redact it from
      // auto-captured URL properties so it never lands in analytics.
      sanitize_properties: (props) => {
        for (const k of ["$current_url", "$referrer"]) {
          const v = props[k];
          if (typeof v === "string") {
            props[k] = v.replace(/([?&]cv=)[^&#]+/gi, "$1redacted");
          }
        }
        return props;
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
