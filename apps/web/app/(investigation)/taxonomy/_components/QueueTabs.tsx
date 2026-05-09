"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NodeQueue, NodeType } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { QueueRow } from "./QueueRow";
import { NodeDrawer } from "./NodeDrawer";

const TABS: NodeType[] = ["ROLE", "SKILL", "DOMAIN"];

function parseTab(raw: string | null): NodeType {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "SKILL" || upper === "DOMAIN") return upper;
  return "ROLE";
}

export function QueueTabs({
  queues,
}: {
  queues: Record<NodeType, NodeQueue>;
}) {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<NodeType>(() =>
    parseTab(searchParams.get("tab")),
  );
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);

  const queue = queues[active];
  const maxBlocked = useMemo(
    () =>
      queue.items.reduce((m, it) => Math.max(m, it.vacanciesBlocked), 0),
    [queue],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActive(t)}
            className={cn(
              "border-b-2 px-3 pb-2 font-mono text-xs uppercase tracking-wider",
              t === active
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-secondary",
            )}
          >
            {t}
            <span className="ml-2 text-[10px] text-text-muted">
              {queues[t].items.length}
            </span>
          </button>
        ))}
      </div>

      {queue.items.length === 0 ? (
        <p className="font-mono text-sm text-text-muted">
          no NEW {active.toLowerCase()} nodes — queue is clear
        </p>
      ) : (
        <ul className="flex flex-col gap-[2px] border border-border bg-bg-card">
          {queue.items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              maxBlocked={maxBlocked}
              onSelect={setOpenNodeId}
              selected={openNodeId === item.id}
            />
          ))}
        </ul>
      )}

      {openNodeId !== null ? (
        <NodeDrawer
          nodeId={openNodeId}
          onClose={() => setOpenNodeId(null)}
        />
      ) : null}
    </div>
  );
}
