"use client";

import { useCallback } from "react";
import type { NodeListItem, NodeStatus } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { useUrlState } from "../_hooks/useUrlState";

const STATUS_PILL: Record<NodeStatus, string> = {
  NEW: "border-accent text-accent",
  VERIFIED: "border-success text-success",
  HIDDEN: "border-text-muted text-text-muted",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  NEW: "нове",
  VERIFIED: "підтв.",
  HIDDEN: "прих.",
};

type Props = {
  item: NodeListItem;
  maxBlocked: number;
  selected: boolean;
};

export function NodeRow({ item, maxBlocked, selected }: Props) {
  const { update } = useUrlState();
  const handleSelect = useCallback(
    () => update({ selected: item.id }),
    [item.id, update],
  );

  const widthPct =
    maxBlocked > 0 ? (item.vacanciesBlocked / maxBlocked) * 100 : 0;

  return (
    <li>
      <button
        type="button"
        onClick={handleSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "grid w-full grid-cols-[1fr_auto_auto_56px_88px] items-center gap-3 border-l-2 px-3 py-2 text-left font-mono text-sm transition-colors",
          selected
            ? "border-accent bg-bg-elev text-accent"
            : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
        )}
      >
        <span className="truncate" title={item.canonicalName}>
          {item.canonicalName}
        </span>
        <span
          className={cn(
            "border px-2 py-[1px] text-[10px] uppercase tracking-wider",
            STATUS_PILL[item.status],
          )}
        >
          {STATUS_LABEL[item.status]}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {item.type}
        </span>
        <span className="text-right text-xs text-text-muted">
          {item.vacanciesBlocked}
        </span>
        <div
          className="h-2 w-full bg-bg-card"
          title={`${item.vacanciesBlocked} вакансій · ${item.aliasCount} псевдонімів`}
        >
          <div
            className="h-full bg-accent"
            style={{ width: `${widthPct}%` }}
            aria-hidden="true"
          />
        </div>
      </button>
    </li>
  );
}
