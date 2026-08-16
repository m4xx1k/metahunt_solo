"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";

import { subscriptionsApi, type SubscriptionParams } from "@/lib/api/subscriptions";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { Button } from "@/ui";

// One-tap "get it in Telegram" conversion CTA: creates the subscription and
// hands off to the bot deep-link. Shared by the /radar landings and /match.
// Which landing it sat on is a page question — $pageview answers it.
export function SubscribeCta({
  params,
  label = "Отримувати в Telegram →",
}: {
  params: SubscriptionParams;
  label?: string;
}) {
  const analytics = useAnalytics();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const result = await subscriptionsApi.create(params);
      if (tab) {
        tab.opener = null;
        tab.location.href = result.deepLink;
      } else {
        window.location.href = result.deepLink;
      }
    } catch {
      analytics.subscriptionCreateFailed("feed");
      tab?.close();
      toast.error("Не вдалося створити радар. Спробуй ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }, [analytics, isSubmitting, params]);

  return (
    <Button
      type="button"
      size="lg"
      onClick={handleSubscribe}
      disabled={isSubmitting}
      className="w-full sm:w-auto"
    >
      <PaperPlaneTiltIcon weight="fill" className="h-5 w-5" aria-hidden />
      {isSubmitting ? "Відкриваємо Telegram…" : label}
    </Button>
  );
}
