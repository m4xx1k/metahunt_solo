"use client";

import { useCallback } from "react";
import type { NodeListItem, NodeStatus } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { useUrlState } from "../_hooks/use-url-state";

const STATUS_PILL: Record<NodeStatus, string> = {
  NEW: "border-accent text-accent",
  VERIFIED: "border-success text-success",
  HIDDEN: "border-text-muted text-text-muted",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  NEW: "new",
  VERIFIED: "verified",
  HIDDEN: "hidden",
};

type Props = {
  item: NodeListItem;
  maxBlocked: number;
  selected: boolean;
};

export function NodeRow({ item, maxBlocked, selected }: Props) {
  const { update } = useUrlState();
  const handleSelect = useCallback(() => update({ selected: item.id }), [item.id, update]);

  const widthPct = maxBlocked > 0 ? (item.vacanciesBlocked / maxBlocked) * 100 : 0;

  return (
    <li>
      <button
        type="button"
        onClick={handleSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1.5 border-l-2 px-3 py-3 text-left font-mono text-sm transition-colors sm:grid sm:grid-cols-[1fr_auto_auto_56px_88px] sm:items-center sm:gap-3 sm:py-2",
          selected
            ? "border-accent bg-bg-elev text-accent"
            : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-2 sm:contents">
          <span className="truncate" title={item.canonicalName}>
            {item.canonicalName}
          </span>
          <span
            className={cn(
              "shrink-0 border px-2 py-[1px] text-2xs uppercase tracking-wider",
              STATUS_PILL[item.status],
            )}
          >
            {STATUS_LABEL[item.status]}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:contents">
          <span className="text-2xs uppercase tracking-wider text-text-muted">{item.type}</span>
          <span className="text-xs text-text-muted sm:text-right">{item.vacanciesBlocked}</span>
          <div
            className="h-2 flex-1 bg-bg-card sm:w-full sm:flex-none"
            title={`${item.vacanciesBlocked} vacancies · ${item.aliasCount} aliases`}
          >
            <div
              className="h-full bg-accent"
              style={{ width: `${widthPct}%` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </button>
    </li>
  );
}
