"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type PropsWithChildren, useEffect } from "react";

import { persistFirstTouch } from "@/lib/analytics/attribution";
import { PageViewTracker } from "@/lib/analytics/page-view-tracker";

// Client-side product analytics. It is dormant without NEXT_PUBLIC_POSTHOG_KEY.
// Browser events stay anonymous until successful auth identifies with users.id;
// this app never persists a browser journey or PostHog person ID in product DB.
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
      capture_pageview: false,
      // No noisy DOM-click firehose; the frozen product contract is intentionally small.
      autocapture: false,
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

  return (
    <PHProvider client={posthog}>
      <PageViewTracker />
      {children}
    </PHProvider>
  );
}
