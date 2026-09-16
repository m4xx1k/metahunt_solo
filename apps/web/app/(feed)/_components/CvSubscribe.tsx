"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { useSaved } from "@/lib/hooks/use-saved";
import { subscriptionsApi, type CvMatchParams } from "@/lib/api/subscriptions";
import {
  DEFAULT_FRESHNESS,
  FRESHNESS_DAYS,
  asEnums,
  type FilterState,
} from "@/features/vacancy-filters/types";
import type {
  EmploymentType,
  EnglishLevel,
  ListVacanciesQuery,
  Seniority,
  WorkFormat,
} from "@/lib/api/vacancies";
import type { FitTier } from "@/lib/api/ranking";
import { formatMatchRate, useMatchRate } from "../_hooks/use-match-rate";

// CV subscribe: replays the on-screen filters — including domain + experience
// (the replay-gap fix) — into a Telegram digest ranked by the active CV.
// Disabled on demo samples (no owner to notify). The tab opens inside the click
// gesture so the popup blocker doesn't eat the post-fetch navigation.
export function CvSubscribe({
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
  // The rate only needs the real, JWT-resolved CV (this component is disabled
  // for a sample profile below), so it never has to pass a candidateId.
  const rateLabel = formatMatchRate(useMatchRate(disabled ? null : toRateQuery(filters)));

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const params = toCvMatchParams(filters);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params, candidateId);
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
    <div className="flex flex-col gap-1.5">
      {rateLabel ? (
        <p className="text-center font-mono text-2xs text-text-muted">{rateLabel} new matches</p>
      ) : null}
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
    </div>
  );
}

function toCvMatchParams(f: FilterState): CvMatchParams {
  return {
    seniorities: asEnums<Seniority>(f.seniorities),
    workFormats: asEnums<WorkFormat>(f.workFormats),
    englishLevels: asEnums<EnglishLevel>(f.englishLevels),
    employmentTypes: asEnums<EmploymentType>(f.employmentTypes),
    domainIds: f.domainIds.length ? f.domainIds : undefined,
    roleIds: f.roleIds.length ? f.roleIds : undefined,
    excludedSkillIds: f.excludedSkillIds.length ? f.excludedSkillIds : undefined,
    experienceYears: f.experienceYears.length ? f.experienceYears : undefined,
    hasTestAssignment: f.test ?? undefined,
    hasReservation: f.reservation ?? undefined,
    minFitTier: (f.minFitTier as FitTier | null) ?? undefined,
    postedWithinDays: FRESHNESS_DAYS[f.freshness] ?? FRESHNESS_DAYS[DEFAULT_FRESHNESS],
  };
}

// Same criteria as the subscription itself — its `postedWithinDays` is
// overridden by the rate hook's own fixed window (see use-match-rate).
function toRateQuery(
  f: FilterState,
): Omit<ListVacanciesQuery, "page" | "pageSize" | "postedWithinDays"> {
  return toCvMatchParams(f);
}
