"use client";

import { Button } from "@/ui";
import type { MeSubscription } from "@/lib/api/me";

export function SubscriptionCard({
  sub,
  onToggle,
  onDelete,
  onEdit,
  editable,
  busy,
}: {
  sub: MeSubscription;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  editable: boolean;
  busy: boolean;
}) {
  const handleToggle = () => onToggle(sub.id, !sub.isActive);
  const handleDelete = () => onDelete(sub.id);
  const handleEdit = () => onEdit(sub.id);

  return (
    <li className="flex flex-col gap-3 border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold text-text-primary">
          {sub.name || sub.label}
        </p>
        <p className="mt-1 truncate text-xs text-text-secondary">{sub.label}</p>
        <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
          {sub.isCv ? "CV match" : "feed filter"} ·{" "}
          <span className={sub.isActive ? "text-success" : "text-text-muted"}>
            {sub.isActive ? "активна" : "пауза"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {editable ? (
          <Button variant="secondary" size="sm" onClick={handleEdit} disabled={busy}>
            налаштувати
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={handleToggle} disabled={busy}>
          {sub.isActive ? "пауза" : "увімкнути"}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDelete} disabled={busy}>
          видалити
        </Button>
      </div>
    </li>
  );
}
