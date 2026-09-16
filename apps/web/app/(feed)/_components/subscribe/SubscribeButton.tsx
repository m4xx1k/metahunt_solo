"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { subscriptionsApi, type SubscriptionParams } from "@/lib/api/subscriptions";
import { formatMatchRate, useMatchRate } from "../../_hooks/use-match-rate";

// Single tap: create a fresh pending subscription from the current facet filter
// and hand off straight to Telegram, where `/start <id>` links the chat and
// activates it. We open the tab synchronously inside the click gesture (with
// `about:blank`) so the popup blocker doesn't eat the post-fetch navigation,
// then point it at the deep link once the row exists. Every tap creates a new
// subscription (dedup of identical filters happens later, at `/start` time).
export function SubscribeButton({ params }: { params: SubscriptionParams }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const analytics = useAnalytics();
  const rateLabel = formatMatchRate(useMatchRate(params));

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params);
      if (tab) {
        tab.opener = null;
        tab.location.href = res.deepLink;
      } else {
        window.location.href = res.deepLink;
      }
    } catch {
      analytics.subscriptionCreateFailed("feed");
      tab?.close();
      toast.error("Failed to create alert");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, params, analytics]);

  return (
    // Sticky (not fixed) to its own containing block, so it rides along while
    // the (often long) filter panel below it scrolls, without ever leaving
    // document flow or overlaying the page like a fixed bar would.
    <div className="sticky top-24 z-10 flex flex-col gap-2 border-2 border-accent bg-accent-subtle-bg p-3 shadow-brut">
      {rateLabel ? (
        <p className="text-center font-mono text-2xs text-text-secondary">
          {rateLabel} new matches
        </p>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size="md"
        className="w-full"
        disabled={isSubmitting}
        onClick={handleSubscribe}
      >
        Get alerts on Telegram
      </Button>
    </div>
  );
}
