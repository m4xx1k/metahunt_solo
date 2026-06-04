"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui-kit";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import {
  subscriptionsApi,
  type SubscriptionParams,
} from "@/lib/api/subscriptions";

// Single tap: create a fresh pending subscription from the current facet filter
// and hand off straight to Telegram, where `/start <id>` links the chat and
// activates it. We open the tab synchronously inside the click gesture (with
// `about:blank`) so the popup blocker doesn't eat the post-fetch navigation,
// then point it at the deep link once the row exists. Every tap creates a new
// subscription (dedup of identical filters happens later, at `/start` time).
export function SubscribeButton({ params }: { params: SubscriptionParams }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const analytics = useAnalytics();

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params);
      analytics.subscriptionCreated(res.id, params);
      if (tab) {
        tab.opener = null;
        tab.location.href = res.deepLink;
      } else {
        window.location.href = res.deepLink;
      }
    } catch {
      tab?.close();
      toast.error("Не вдалося створити підписку");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, params, analytics]);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="w-full"
      disabled={isSubmitting}
      onClick={handleSubscribe}
    >
      🔔 Сповіщення в Telegram
    </Button>
  );
}
