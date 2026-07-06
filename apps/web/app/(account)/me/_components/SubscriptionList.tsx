"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { meApi } from "@/lib/api/me";
import { SubscriptionCard } from "./SubscriptionCard";

const SUBS_KEY = ["me", "subscriptions"];

// The user's Telegram subscriptions — pause/resume + delete. Owns the query so
// SubscriptionCard stays a dumb presenter.
export function SubscriptionList() {
  const qc = useQueryClient();
  const { data: subs, isLoading } = useQuery({
    queryKey: SUBS_KEY,
    queryFn: meApi.listSubscriptions,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      meApi.setSubscriptionActive(id, isActive),
    onSuccess: () => void qc.invalidateQueries({ queryKey: SUBS_KEY }),
    onError: () => toast.error("Couldn't update subscription"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => meApi.deleteSubscription(id),
    onSuccess: () => {
      toast.success("Subscription removed");
      void qc.invalidateQueries({ queryKey: SUBS_KEY });
    },
    onError: () => toast.error("Couldn't remove subscription"),
  });

  return (
    <section>
      <h2 className="mb-3 font-mono text-2xs uppercase tracking-wider text-text-muted">
        my subscriptions
      </h2>
      {isLoading ? (
        <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          loading…
        </p>
      ) : !subs || subs.length === 0 ? (
        <div className="border border-dashed border-border bg-bg-card p-6">
          <p className="font-mono text-2xs uppercase tracking-wider text-text-secondary">
            no subscriptions yet — tune a feed and subscribe to get telegram alerts
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {subs.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub}
              onToggle={() => toggle.mutate({ id: sub.id, isActive: !sub.isActive })}
              onDelete={() => remove.mutate(sub.id)}
              busy={toggle.isPending || remove.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
