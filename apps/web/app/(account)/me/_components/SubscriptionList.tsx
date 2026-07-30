"use client";

import { useCallback, useMemo, useState } from "react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
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
    onError: () => toast.error("Не вдалося оновити підписку"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => meApi.deleteSubscription(id),
    onSuccess: () => {
      toast.success("Підписку видалено");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions });
    },
    onError: () => toast.error("Не вдалося видалити підписку"),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSubscription }) =>
      meApi.updateSubscription(id, patch),
    onSuccess: () => {
      setEditingId(null);
      toast.success("Підписку оновлено");
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.subscriptions });
    },
    onError: () => toast.error("Не вдалося зберегти"),
  });

  const handleToggle = useCallback(
    (id: string, isActive: boolean) => toggle.mutate({ id, isActive }),
    [toggle],
  );
  const handleDelete = useCallback((id: string) => remove.mutate(id), [remove]);
  const handleEdit = useCallback((id: string) => setEditingId(id), []);
  const handleCancel = useCallback(() => setEditingId(null), []);
  const handleSave = useCallback(
    (id: string, patch: UpdateSubscription) => update.mutate({ id, patch }),
    [update],
  );

  const active = subs?.filter((s) => s.isActive).length ?? 0;
  const roleOptions = useMemo(() => toOptions(roles?.roles ?? []), [roles]);
  const skillOptions = useMemo(() => toOptions(skills?.skills ?? []), [skills]);
  const domainOptions = useMemo(() => toOptions(domains?.domains ?? []), [domains]);
  const busy = toggle.isPending || remove.isPending || update.isPending;

  return (
    <Panel title="підписки" meta={subs?.length ? `${active}/${subs.length} активні` : undefined}>
      {isLoading ? (
        <EmptyState title="завантаження…" />
      ) : !subs || subs.length === 0 ? (
        <EmptyState
          title="підписок ще немає"
          hint="налаштуй пошук і отримуй нові збіги в Telegram"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {subs.map((sub) =>
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
