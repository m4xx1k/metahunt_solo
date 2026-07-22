"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";

import { subscriptionsApi, type SubscriptionParams } from "@/lib/api/subscriptions";
import { useAnalytics, type AcquisitionAttribution } from "@/lib/hooks/use-analytics";
import { Button } from "@/ui";

const LANDING_VARIANT = "backend_radar_v1";

export function RadarSubscribe({
  params,
  attribution,
  trackImpression = false,
}: {
  params: SubscriptionParams;
  attribution: AcquisitionAttribution;
  trackImpression?: boolean;
}) {
  const analytics = useAnalytics();
  const impressionSent = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!trackImpression || impressionSent.current) return;
    impressionSent.current = true;
    analytics.landingViewed(LANDING_VARIANT, attribution);
  }, [analytics, attribution, trackImpression]);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    analytics.landingCtaClicked(LANDING_VARIANT, attribution);
    analytics.subscriptionCreateStarted("feed", params);
    const tab = window.open("about:blank", "_blank");
    try {
      const result = await subscriptionsApi.create(params);
      analytics.subscriptionCreated(params);
      analytics.subscriptionHandoffOpened("feed");
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
  }, [analytics, attribution, isSubmitting, params]);

  return (
    <Button
      type="button"
      size="lg"
      onClick={handleSubscribe}
      disabled={isSubmitting}
      className="w-full sm:w-auto"
    >
      <PaperPlaneTiltIcon weight="fill" className="h-5 w-5" aria-hidden />
      {isSubmitting ? "Відкриваємо Telegram…" : "Отримувати в Telegram →"}
    </Button>
  );
}
