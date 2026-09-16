"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { ApiError } from "@/lib/api/client";
import { useSaved } from "@/lib/hooks/use-saved";
import { subscriptionsApi, type CvMatchParams } from "@/lib/api/subscriptions";
import type { SubscriptionParams } from "@/lib/api/subscriptions";
import { formatMatchRate, useMatchRate } from "../../_hooks/use-match-rate";

// The page's one subscribe control, in the filter column, with or without a CV.
// A subscription IS the on-screen filter persisted to Telegram — the CV only
// ranks what it delivers — so it lives beside the filters in both states
// instead of migrating into the CV rail the moment a CV appears.
//
// Single tap: create a fresh pending subscription and hand off straight to
// Telegram, where `/start <id>` links the chat and activates it. The tab opens
// synchronously inside the click gesture (with `about:blank`) so the popup
// blocker doesn't eat the post-fetch navigation, then points at the deep link
// once the row exists. Every tap creates a new subscription (dedup of identical
// filters happens later, at `/start` time).
export function SubscribeCard({
  params,
  viewer = null,
}: {
  /** The current filter, already stripped of pagination + scope toggles. */
  params: SubscriptionParams | CvMatchParams;
  /** A real CV in view → the digest is ranked against it. Samples can't own one. */
  viewer?: { candidateId: string; label: string; isSample: boolean } | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const analytics = useAnalytics();
  // Both subscribe endpoints are behind the JWT guard, so an anonymous click
  // could only ever 401 — offer the login that unblocks it instead.
  const { isLoggedIn, isLoading: sessionLoading } = useSession();
  const { addSub } = useSaved();
  const isSample = viewer?.isSample ?? false;
  const candidateId = viewer && !isSample ? viewer.candidateId : null;
  const label = viewer?.label ?? "Feed";
  const rateLabel = formatMatchRate(useMatchRate(isSample ? null : params));

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params, candidateId ?? undefined);
      addSub({
        id: res.id,
        lens: candidateId ? "warm" : "cold",
        label,
        query: window.location.search.replace(/^\?/, ""),
        candidateId: candidateId ?? undefined,
        addedAt: Date.now(),
      });
      if (tab) {
        tab.opener = null;
        tab.location.href = res.deepLink;
      } else {
        window.location.href = res.deepLink;
      }
    } catch (e) {
      analytics.subscriptionCreateFailed(candidateId ? "cv" : "feed");
      tab?.close();
      // A dormant bot (no TELEGRAM_BOT_TOKEN) is the one 400 here, and it is the
      // server's problem, not a filter the user can fix — say so.
      toast.error(
        e instanceof ApiError && e.status === 400
          ? "Telegram is unavailable right now"
          : "Failed to create alert",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, params, candidateId, label, addSub, analytics]);

  // A sample profile has no owner to notify, so there is nothing to persist.
  if (isSample) {
    return (
      <p className="border border-border bg-bg-card px-3 py-2 font-mono text-2xs leading-relaxed text-text-muted">
        Upload your own CV to subscribe to matches
      </p>
    );
  }

  return (
    // No sticky of its own: it sits at the top of a rail that is already sticky
    // (STICKY_RAIL) and self-scrolling, where a nested `sticky top-24` sticks to
    // the rail's scrollbox rather than the viewport and leaves a 6rem gap above.
    <div className="flex flex-col gap-2 border-2 border-accent bg-accent-subtle-bg p-3 shadow-brut">
      {rateLabel ? (
        <p className="text-center font-mono text-2xs text-text-secondary">
          {rateLabel} new matches
        </p>
      ) : null}
      {isLoggedIn || sessionLoading ? (
        <Button
          type="button"
          variant="primary"
          size="md"
          className="w-full"
          disabled={isSubmitting || sessionLoading}
          onClick={handleSubscribe}
        >
          Get alerts on Telegram
        </Button>
      ) : (
        <AuthChoice label="Get alerts on Telegram" size="md" className="w-full" align="start" />
      )}
    </div>
  );
}
