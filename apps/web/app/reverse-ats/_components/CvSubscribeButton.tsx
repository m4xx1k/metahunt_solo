"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import {
  subscriptionsApi,
  type CvMatchParams,
} from "@/lib/api/subscriptions";
import { nonEmpty } from "@/lib/utils";
import { FRESH_DAYS, type Filters } from "./filter-model";

// CV counterpart of the feed's SubscribeButton: same Telegram handoff, plus a
// candidateId so the digest ranks via rankByRefs. Tab opens in the click
// gesture so the popup blocker doesn't eat the post-fetch navigation.
export function CvSubscribeButton({
  candidateId,
  filters,
}: {
  candidateId: string;
  filters: Filters;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const analytics = useAnalytics();

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const params = toCvMatchParams(filters);
      const res = await subscriptionsApi.create(params, candidateId);
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
  }, [isSubmitting, candidateId, filters, analytics]);

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className="w-full"
      disabled={isSubmitting}
      onClick={handleSubscribe}
    >
      Сповіщення в Telegram
    </Button>
  );
}

// Mirrors ReverseAtsClient's fetch mapping, so the sub replays what's on screen.
function toCvMatchParams(f: Filters): CvMatchParams {
  return {
    seniorities: nonEmpty(f.seniorities),
    workFormats: nonEmpty(f.workFormats),
    englishLevels: nonEmpty(f.englishLevels),
    employmentTypes: nonEmpty(f.employmentTypes),
    hasTestAssignment: f.noTest ? false : undefined,
    hasReservation: f.reservation ? true : undefined,
    minFitTier: f.minFitTier ?? undefined,
    postedWithinDays: f.fresh ? FRESH_DAYS : undefined,
  };
}
