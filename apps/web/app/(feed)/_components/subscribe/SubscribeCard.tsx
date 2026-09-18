"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/ui";
import { AuthChoice } from "@/features/auth/auth-choice";
import { cn } from "@/lib/utils";
import { useSession } from "@/features/auth/use-session";
import { RailCard } from "../RailCard";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { ApiError } from "@/lib/api/client";
import { meApi } from "@/lib/api/me";
import { subscriptionsApi, type SubscriptionFilter } from "@/lib/api/subscriptions";
import {
  findMatchingSubscription,
  subscriptionCovers,
  dedupeByFilter,
  filterToState,
} from "@/features/vacancy-filters/subscription-criteria";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { formatMatchRate, useMatchRate } from "../../_hooks/use-match-rate";

// A rail, not an inbox: the rest live on /me, which can edit and delete them.

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
  params: SubscriptionFilter;
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
  // A new subscription is always the filter on screen. CV-ranked digests are
  // legacy: they still run, they are just no longer created here.
  const rateLabel = formatMatchRate(useMatchRate(isSample ? null : params, false));

  // `isLoading` is false while the query is disabled (anonymous / sample), so
  // this only ever gates the logged-in fetch.
  // `isFetching`, not `isLoading`: the latter is false as soon as there is any
  // cached list, so the refetch after a create left the button live against a
  // stale list — every extra click made another identical subscription.
  const { data: subs, isFetching: subsFetching } = useQuery({
    queryKey: ["me", "subscriptions"],
    queryFn: meApi.listSubscriptions,
    enabled: isLoggedIn && !isSample,
    staleTime: 60_000,
  });
  const existing = findMatchingSubscription(subs, params);
  // Live only (an unconfirmed row is an unfinished tap, and the GC sweeps it),
  // one row per distinct filter.
  const saved = dedupeByFilter((subs ?? []).filter((s) => s.status === "live"));

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await subscriptionsApi.create(params);
      // Awaited: the card must not re-offer the same subscription while the
      // list it checks against is still in flight.
      await qc.invalidateQueries({ queryKey: ["me", "subscriptions"] });
      if (tab) {
        tab.opener = null;
        tab.location.href = res.deepLink;
      } else {
        window.location.href = res.deepLink;
      }
    } catch (e) {
      analytics.subscriptionCreateFailed("feed");
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
  }, [isSubmitting, params, qc, analytics]);

  // A sample profile has no owner to notify, so there is nothing to persist.
  if (isSample) {
    return (
      <p className="border border-border bg-bg-card px-3 py-2 font-mono text-2xs leading-relaxed text-text-muted">
        Upload a CV to subscribe
      </p>
    );
  }

  return (
    <RailCard
      title="subscriptions"
      meta={saved.length > 0 ? saved.length : null}
      picker={
        saved.length > 0
          ? saved.map((s) => {
              const covers = subscriptionCovers(s, params);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={covers}
                  onClick={() => filterApi.replace(filterToState(s.params, sources))}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-2xs transition-colors",
                    covers
                      ? "bg-accent-subtle-bg font-bold text-accent"
                      : "text-text-secondary hover:bg-bg-elev hover:text-accent",
                  )}
                >
                  <span className="truncate">{s.name || s.label}</span>
                  {s.isCv ? <span className="ml-auto shrink-0 opacity-60">CV</span> : null}
                </button>
              );
            })
          : null
      }
      action={
        existing ? (
          <>
            <p className="text-center font-mono text-2xs text-text-secondary">you get this one</p>
            <Link
              href={`/me?sub=${existing.id}#subscriptions`}
              className="border border-accent px-3 py-2 text-center font-mono text-2xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-bg"
            >
              edit it
            </Link>
          </>
        ) : (
          <>
            {isLoggedIn || sessionLoading ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="w-full"
                // Until the list is in, "no identical subscription" is unknown,
                // not false — offering the button here creates a second digest.
                disabled={isSubmitting || sessionLoading || subsFetching}
                onClick={handleSubscribe}
              >
                Get these in Telegram
              </Button>
            ) : (
              <AuthChoice
                label="Get these in Telegram"
                size="md"
                className="w-full"
                align="start"
              />
            )}
            {rateLabel ? (
              <p className="text-center font-mono text-2xs text-text-secondary">
                about {rateLabel.replace("~", "")} new jobs
              </p>
            ) : null}
          </>
        )
      }
    />
  );
}
