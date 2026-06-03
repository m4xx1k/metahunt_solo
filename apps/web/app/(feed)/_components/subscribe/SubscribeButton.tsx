"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui-kit";
import {
  subscriptionsApi,
  type SubscriptionParams,
} from "@/lib/api/subscriptions";

// Creates a pending subscription from the current facet filter, then surfaces
// the `t.me/<bot>?start=<id>` deep link. Tapping it hands off to Telegram,
// where `/start <id>` links the chat and activates the subscription.
export function SubscribeButton({ params }: { params: SubscriptionParams }) {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await subscriptionsApi.create(params);
      setDeepLink(res.deepLink);
    } catch {
      toast.error("Не вдалося створити підписку");
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, params]);

  if (deepLink) {
    return (
      <div className="flex flex-col gap-2 border border-border bg-bg-card p-4">
        <p className="font-body text-[13px] text-text-muted">
          Залишився крок: відкрий бота, щоб активувати сповіщення за цим
          фільтром.
        </p>
        <a href={deepLink} target="_blank" rel="noopener noreferrer">
          <Button variant="primary" size="sm" className="w-full">
            Відкрити Telegram →
          </Button>
        </a>
      </div>
    );
  }

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
