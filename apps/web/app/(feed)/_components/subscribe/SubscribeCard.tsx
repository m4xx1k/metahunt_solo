"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/ui";
import { AuthChoice } from "@/features/auth/auth-choice";
import { useSession } from "@/features/auth/use-session";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { ApiError } from "@/lib/api/client";
import { meApi } from "@/lib/api/me";
import { subscriptionsApi, type CvMatchParams } from "@/lib/api/subscriptions";
import type { SubscriptionParams } from "@/lib/api/subscriptions";
import {
  findMatchingSubscription,
  subscriptionCriteriaToFilters,
} from "@/features/vacancy-filters/subscription-criteria";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { formatMatchRate, useMatchRate } from "../../_hooks/use-match-rate";

// A rail, not an inbox: the rest live on /me, which can edit and delete them.
const SAVED_SHOWN = 4;

// The page's one subscribe control, in the filter column, with or without a CV.
// A subscription IS the on-screen filter persisted to Telegram — the CV only
// ranks what it delivers — so it lives beside the filters in both states
// instead of migrating into the CV rail the moment a CV appears.
//
// It also reads what the account already has: an identical subscription turns
// the card into a confirmation (a second one would only double the digest), and
// the others become one tap back into a filter already saved.
//
// Single tap: create a fresh pending subscription and hand off straight to
// Telegram, where `/start <id>` links the chat and activates it. The tab opens
// synchronously inside the click gesture (with `about:blank`) so the popup
// blocker doesn't eat the post-fetch navigation, then points at the deep link
// once the row exists.
export function SubscribeCard({
  params,
  viewer = null,
  sources,
}: {
  /** The current filter, already stripped of pagination + scope toggles. */
  params: SubscriptionParams | CvMatchParams;
  /** A real CV in view → the digest is ranked against it. Samples can't own one. */
  viewer?: { candidateId: string; label: string; isSample: boolean } | null;
  /** Source catalog — replaying a saved filter needs sourceId → ?source=code. */
  sources: { id: string; code: string }[];
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const analytics = useAnalytics();
  const qc = useQueryClient();
  const filterApi = useUrlFilters();
  // Both subscribe endpoints are behind the JWT guard, so an anonymous click
  // could only ever 401 — offer the login that unblocks it instead.
  const { isLoggedIn, isLoading: sessionLoading } = useSession();
  const isSample = viewer?.isSample ?? false;
  const candidateId = viewer && !isSample ? viewer.candidateId : null;
  const rateLabel = formatMatchRate(useMatchRate(isSample ? null : params));

  const { data: subs } = useQuery({
    queryKey: ["me", "subscriptions"],
    queryFn: meApi.listSubscriptions,
    enabled: isLoggedIn && !isSample,
    staleTime: 60_000,
  });
  const existing = findMatchingSubscription(subs, params, candidateId);
  const others = (subs ?? []).filter((s) => s.id !== existing?.id);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params, candidateId ?? undefined);
      // Pending until /start, but it already counts as "you have this one" —
      // refetch so the card stops offering to create it a second time.
      void qc.invalidateQueries({ queryKey: ["me", "subscriptions"] });
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
  }, [isSubmitting, params, candidateId, qc, analytics]);

  // A sample profile has no owner to notify, so there is nothing to persist.
  if (isSample) {
    return (
      <p className="border border-border bg-bg-card px-3 py-2 font-mono text-2xs leading-relaxed text-text-muted">
        Upload your own CV to subscribe to matches
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* No sticky of its own: it sits at the top of a rail that is already
          sticky (STICKY_RAIL) and self-scrolling, where a nested `sticky top-24`
          sticks to the rail's scrollbox and leaves a 6rem gap above itself. */}
      <div className="flex flex-col gap-2 border-2 border-accent bg-accent-subtle-bg p-3 shadow-brut">
        {existing ? (
          <>
            <p className="text-center font-mono text-2xs text-text-secondary">
              ✓ subscribed{existing.isActive ? "" : " · confirm in Telegram"}
            </p>
            <Link
              href="/me#subscriptions"
              className="border border-accent px-3 py-2 text-center font-mono text-2xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-bg"
            >
              manage alerts
            </Link>
          </>
        ) : (
          <>
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
              <AuthChoice
                label="Get alerts on Telegram"
                size="md"
                className="w-full"
                align="start"
              />
            )}
          </>
        )}
      </div>

      {others.length > 0 ? (
        <div className="flex flex-col border border-border bg-bg-card">
          <p className="border-b border-border px-3 py-1.5 font-mono text-2xs uppercase tracking-wider text-text-muted">
            your alerts
          </p>
          {others.slice(0, SAVED_SHOWN).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => filterApi.replace(subscriptionCriteriaToFilters(s.params, sources))}
              className="flex items-center gap-2 px-3 py-2 text-left font-mono text-2xs text-text-secondary transition-colors hover:bg-bg-elev hover:text-accent"
            >
              <span className="truncate">{s.name || s.label}</span>
              {s.isCv ? <span className="ml-auto shrink-0 text-text-muted">cv</span> : null}
            </button>
          ))}
          {others.length > SAVED_SHOWN ? (
            <Link
              href="/me#subscriptions"
              className="border-t border-border px-3 py-2 font-mono text-2xs text-text-muted transition-colors hover:text-accent"
            >
              +{others.length - SAVED_SHOWN} more…
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
