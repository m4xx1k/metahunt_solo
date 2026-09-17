"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Panel } from "@/ui/layout/Panel";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { facetsApi, type NodeFacet } from "@/lib/api/facets";
import { meApi, type UpdateSubscription } from "@/lib/api/me";
import type { OptionRow } from "@/features/vacancy-filters/types";
import { ACCOUNT_QUERY_KEYS } from "./query-keys";
import { SubscriptionCard } from "./SubscriptionCard";
import { SubscriptionEditor } from "./SubscriptionEditor";

function toOptions(nodes: NodeFacet[]): OptionRow[] {
  return nodes.map((node) => ({ id: node.id, label: node.name, count: node.count }));
}

function supportsEditing(
  subscription: { name?: string; params?: unknown },
  canEdit: boolean,
): boolean {
  return canEdit && typeof subscription.name === "string" && subscription.params !== undefined;
}

export function SubscriptionList({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  // Which subscription is open is state, not a document fragment, so it rides a
  // query param: `/me?sub=<id>` lets "manage alerts" land on the right one.
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();
  const [manualId, setManualId] = useState<string | null>(null);
  const editingId = manualId ?? searchParams.get("sub");
  const closeEditor = useCallback(() => {
    setManualId(null);
    if (searchParams.get("sub")) push((n) => n.delete("sub"));
  }, [push, searchParams]);
  const { data: subs, isLoading } = useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.subscriptions,
    queryFn: meApi.listSubscriptions,
  });

  const catalogsEnabled = editingId !== null;
  const { data: roles } = useQuery({
    queryKey: ["facets", "roles"],
    queryFn: () => facetsApi.roles(),
    enabled: catalogsEnabled,
  });
  const { data: skills } = useQuery({
    queryKey: ["facets", "skills"],
    queryFn: facetsApi.skills,
    enabled: catalogsEnabled,
  });
  const { data: domains } = useQuery({
    queryKey: ["facets", "domains"],
    queryFn: facetsApi.domains,
    enabled: catalogsEnabled,
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      meApi.setSubscriptionActive(id, isActive),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions }),
    onError: () => toast.error("Could not save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => meApi.deleteSubscription(id),
    onSuccess: () => {
      toast.success("Subscription deleted");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions });
    },
    onError: () => toast.error("Could not delete it"),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSubscription }) =>
      meApi.updateSubscription(id, patch),
    onSuccess: () => {
      closeEditor();
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions });
    },
    onError: () => toast.error("Could not save"),
  });

  const handleToggle = useCallback(
    (id: string, isActive: boolean) => toggle.mutate({ id, isActive }),
    [toggle],
  );
  const handleDelete = useCallback((id: string) => remove.mutate(id), [remove]);
  const handleEdit = useCallback((id: string) => setManualId(id), []);
  const handleCancel = useCallback(() => closeEditor(), [closeEditor]);
  const handleSave = useCallback(
    (id: string, patch: UpdateSubscription) => update.mutate({ id, patch }),
    [update],
  );

  // An unconfirmed tap is not a subscription the account has — it never reached
  // Telegram, and the server sweeps it. Showing it only raises questions.
  const shown = useMemo(() => (subs ?? []).filter((s) => s.status !== "pending"), [subs]);
  const active = shown.filter((s) => s.status === "live").length;
  const roleOptions = useMemo(() => toOptions(roles?.roles ?? []), [roles]);
  const skillOptions = useMemo(() => toOptions(skills?.skills ?? []), [skills]);
  const domainOptions = useMemo(() => toOptions(domains?.domains ?? []), [domains]);
  const busy = toggle.isPending || remove.isPending || update.isPending;

  return (
    <Panel title="subscriptions" meta={shown.length ? `${active}/${shown.length} on` : undefined}>
      {isLoading ? (
        <EmptyState title="loading…" />
      ) : shown.length === 0 ? (
        <EmptyState
          title="no subscriptions yet"
          hint="pick your filters and get new jobs in Telegram"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((sub) =>
            sub.id === editingId ? (
              <SubscriptionEditor
                key={sub.id}
                subscription={sub}
                roles={roleOptions}
                skills={skillOptions}
                domains={domainOptions}
                busy={busy}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            ) : (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onEdit={handleEdit}
                editable={supportsEditing(sub, canEdit)}
                busy={busy}
              />
            ),
          )}
        </ul>
      )}
    </Panel>
  );
}
