"use client";

import { Button } from "@/ui";
import type { MeSubscription } from "@/lib/api/me";

// Dumb presenter for one subscription. Parent owns mutations + invalidation.
export function SubscriptionCard({
  sub,
  onToggle,
  onDelete,
  busy,
}: {
  sub: MeSubscription;
  onToggle: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-display text-sm text-text-primary">{sub.label}</p>
        <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
          {sub.isCv ? "cv match" : "feed filter"} ·{" "}
          <span className={sub.isActive ? "text-success" : "text-text-muted"}>
            {sub.isActive ? "active" : "paused"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <Button variant="secondary" size="sm" onClick={onToggle} disabled={busy}>
          {sub.isActive ? "pause" : "resume"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onDelete} disabled={busy}>
          delete
        </Button>
      </div>
    </li>
  );
}
