"use client";

import Link from "next/link";

import { Button } from "@/ui";
import type { MeSubscription } from "@/lib/api/me";

// Absolute date + time: two CVs often carry the same role label.
const formatAddedAt = (iso: string) =>
  new Date(iso).toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function CvBadge({ sub }: { sub: Extract<MeSubscription, { isCv: true }> }) {
  return (
    <>
      <span className="border border-text-muted px-1.5 text-text-muted">CV</span>{" "}
      {sub.cvLabel ? (
        <Link
          href={`/me?cv=${sub.candidateId}#cv`}
          className="normal-case text-text-secondary underline-offset-2 hover:text-accent hover:underline"
        >
          {sub.cvLabel}
          {sub.cvAddedAt ? ` · ${formatAddedAt(sub.cvAddedAt)}` : ""}
        </Link>
      ) : (
        <span className="text-danger">deleted</span>
      )}
    </>
  );
}

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
    <li
      id={`sub-${sub.id}`}
      className="flex scroll-mt-24 flex-col gap-3 border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold text-text-primary">
          {sub.name || sub.label}
        </p>
        <p className="mt-1 truncate text-xs text-text-secondary">{sub.label}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
          {sub.isCv ? <CvBadge sub={sub} /> : <span>filter</span>}
          <span>·</span>
          <span className={sub.status === "live" ? "text-success" : "text-text-muted"}>
            {sub.status === "live" ? "on" : sub.status === "pending" ? "not confirmed" : "off"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {editable ? (
          <Button variant="secondary" size="sm" onClick={handleEdit} disabled={busy}>
            edit
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={handleToggle} disabled={busy}>
          {sub.isActive ? "pause" : "turn on"}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDelete} disabled={busy}>
          delete
        </Button>
      </div>
    </li>
  );
}
