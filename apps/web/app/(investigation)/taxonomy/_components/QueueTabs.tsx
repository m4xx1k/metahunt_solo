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
  pageSize,
}: {
  queues: Record<NodeType, NodeQueue>;
  pageSize: number;
}) {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<NodeType>(() =>
    parseTab(searchParams.get("tab")),
  );
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const queue = queues[active];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return queue.items;
    return queue.items.filter((it) =>
      it.canonicalName.toLowerCase().includes(needle),
    );
  }, [queue, search]);

  const maxBlocked = useMemo(
    () => filtered.reduce((m, it) => Math.max(m, it.vacanciesBlocked), 0),
    [filtered],
  );

  const onTabSwitch = (t: NodeType) => {
    setActive(t);
    setSearch("");
    setOpenNodeId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabSwitch(t)}
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

      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`filter ${active.toLowerCase()} by name…`}
          aria-label={`filter ${active.toLowerCase()} queue by name`}
          className="border border-border bg-bg-card px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-accent"
        />
        <span className="font-mono text-[11px] text-text-muted">
          showing {filtered.length} of {queue.items.length}
          {queue.items.length >= pageSize
            ? ` · top ${pageSize} by impact (backend cap: load more lands when phase-2 ships)`
            : " · all NEW nodes for this axis"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="font-mono text-sm text-text-muted">
          {queue.items.length === 0
            ? `no NEW ${active.toLowerCase()} nodes — queue is clear`
            : `no ${active.toLowerCase()} matches "${search}"`}
        </p>
      ) : (
        <ul className="flex flex-col gap-[2px] border border-border bg-bg-card">
          {filtered.map((item) => (
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
