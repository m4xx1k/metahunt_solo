"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { subscriptionsApi, type CvMatchParams } from "@/lib/api/subscriptions";
import {
  DEFAULT_FRESHNESS,
  FRESHNESS_DAYS,
  asEnums,
  type FilterState,
} from "@/features/vacancy-filters/types";
import type { EmploymentType, EnglishLevel, Seniority, WorkFormat } from "@/lib/api/vacancies";
import type { FitTier } from "@/lib/api/ranking";

// Warm subscribe: replays the on-screen CV filters — including domain +
// experience (the replay-gap fix) — into a Telegram digest ranked by the CV.
// Disabled on demo samples (no owner to notify). The tab opens inside the click
// gesture so the popup blocker doesn't eat the post-fetch navigation.
export function WarmSubscribe({
  candidateId,
  filters,
  label,
  disabled = false,
}: {
  candidateId: string;
  filters: FilterState;
  label: string;
  disabled?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const analytics = useAnalytics();
  const { addSub } = useSaved();

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const params = toCvMatchParams(filters);
    analytics.subscriptionCreateStarted("cv", params);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params, candidateId);
      analytics.subscriptionCreated(params);
      analytics.subscriptionHandoffOpened("cv");
      addSub({
        id: res.id,
        lens: "warm",
        label,
        query: window.location.search.replace(/^\?/, ""),
        candidateId,
        addedAt: Date.now(),
      });
      if (tab) {
        tab.opener = null;
        tab.location.href = res.deepLink;
      } else {
        window.location.href = res.deepLink;
      }
    } catch {
      analytics.subscriptionCreateFailed("cv");
      tab?.close();
      toast.error("Failed to create alert");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, candidateId, filters, label, analytics, addSub]);

  if (disabled) {
    return (
      <p className="border border-border bg-bg-card px-3 py-2 font-mono text-2xs leading-relaxed text-text-muted">
        Upload your own CV to subscribe to matches
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className="w-full"
      disabled={isSubmitting}
      onClick={handleSubscribe}
    >
      Get alerts on Telegram
    </Button>
  );
}

function toCvMatchParams(f: FilterState): CvMatchParams {
  return {
    seniorities: asEnums<Seniority>(f.seniorities),
    workFormats: asEnums<WorkFormat>(f.workFormats),
    englishLevels: asEnums<EnglishLevel>(f.englishLevels),
    employmentTypes: asEnums<EmploymentType>(f.employmentTypes),
    domainIds: f.domainIds.length ? f.domainIds : undefined,
    experienceYears: f.experienceYears.length ? f.experienceYears : undefined,
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    postedWithinDays: FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
  };
}
