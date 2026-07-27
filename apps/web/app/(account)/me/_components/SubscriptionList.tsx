"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Panel } from "@/ui/layout/Panel";
import { EmptyState } from "@/ui/feedback/EmptyState";
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

  const active = subs?.filter((s) => s.isActive).length ?? 0;

  return (
    <Panel
      title="subscriptions"
      meta={subs?.length ? `${active}/${subs.length} active` : undefined}
    >
      {isLoading ? (
        <EmptyState title="loading…" />
      ) : !subs || subs.length === 0 ? (
        <EmptyState
          title="no subscriptions yet"
          hint="tune a feed and subscribe — new matches arrive in telegram"
        />
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
    </Panel>
  );
}
