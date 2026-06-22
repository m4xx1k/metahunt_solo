"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import type { NodeStatus, NodeType } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { useUrlState } from "../_hooks/use-url-state";

const TYPES: NodeType[] = ["ROLE", "SKILL", "DOMAIN"];

const TYPE_LABEL: Record<NodeType, string> = {
  ROLE: "ролі",
  SKILL: "навички",
  DOMAIN: "напрями",
};

const STATUSES: NodeStatus[] = ["NEW", "VERIFIED", "HIDDEN"];

const STATUS_LABEL: Record<NodeStatus, string> = {
  NEW: "нові",
  VERIFIED: "підтверджені",
  HIDDEN: "приховані",
};

const STATUS_PILL_ACTIVE: Record<NodeStatus, string> = {
  NEW: "border-accent text-accent",
  VERIFIED: "border-success text-success",
  HIDDEN: "border-text-muted text-text-muted",
};

const SEARCH_DEBOUNCE_MS = 250;

type Props = {
  type: NodeType | undefined;
  statuses: NodeStatus[];
  q: string;
  minBlocked: number;
  total: number;
};

export function Filters({ type, statuses, q, minBlocked, total }: Props) {
  const { update } = useUrlState();
  const [searchDraft, setSearchDraft] = useState(q);

  // Debounce typing into `q` so the server isn't re-rendered on every
  // keystroke. We intentionally don't re-sync from the `q` prop on every
  // change — the draft is the source of truth once the user starts typing.
  // Filter changes that aren't text (type / status / blocked) commit
  // synchronously below.
  useEffect(() => {
    if (searchDraft === q) return;
    const handle = window.setTimeout(() => {
      update({ q: searchDraft || null, page: null, selected: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchDraft, q, update]);

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setSearchDraft(e.target.value),
    [],
  );

  const handleBlockedChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      const n = raw === "" ? 0 : Number(raw);
      const safe = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
      update({
        blocked: safe > 0 ? String(safe) : null,
        page: null,
        selected: null,
      });
    },
    [update],
  );

  const handleTypeClick = (next: NodeType | undefined) => () => {
    update({ type: next ?? null, page: null, selected: null });
  };

  const handleStatusClick = (s: NodeStatus) => () => {
    const set = new Set(statuses);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    // Empty status filter would hide every row; treat it as "reset to
    // default (NEW + VERIFIED)" rather than letting the operator paint
    // themselves into an empty list.
    const next = set.size > 0 ? [...set] : ["NEW" as NodeStatus, "VERIFIED" as NodeStatus];
    update({ status: next.join(","), page: null, selected: null });
  };

  return (
    <div className="flex flex-col gap-3 border border-border bg-bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          статус
        </span>
        {STATUSES.map((s) => {
          const active = statuses.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={handleStatusClick(s)}
              className={cn(
                "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors sm:px-2 sm:py-1",
                active
                  ? STATUS_PILL_ACTIVE[s]
                  : "border-border text-text-muted hover:text-text-secondary",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          тип
        </span>
        <button
          type="button"
          onClick={handleTypeClick(undefined)}
          className={cn(
            "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors sm:px-2 sm:py-1",
            type === undefined
              ? "border-accent text-accent"
              : "border-border text-text-muted hover:text-text-secondary",
          )}
        >
          усі
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={handleTypeClick(t)}
            className={cn(
              "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors sm:px-2 sm:py-1",
              type === t
                ? "border-accent text-accent"
                : "border-border text-text-muted hover:text-text-secondary",
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={searchDraft}
          onChange={handleSearchChange}
          placeholder="пошук за назвою чи псевдонімом…"
          aria-label="пошук у довіднику"
          className="w-full border border-border bg-bg-elev px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-accent sm:min-w-[240px] sm:flex-1"
        />
        <label className="flex items-center gap-2 font-mono text-xs text-text-muted">
          блокує ≥
          <input
            type="number"
            min={0}
            step={1}
            value={minBlocked > 0 ? minBlocked : ""}
            onChange={handleBlockedChange}
            placeholder="0"
            aria-label="мінімум заблокованих вакансій"
            className="w-16 border border-border bg-bg-elev px-2 py-2 text-right text-text-primary outline-none focus:border-accent sm:py-1"
          />
        </label>
        <span className="font-mono text-2xs text-text-muted sm:ml-auto">
          знайдено · {total}
        </span>
      </div>
    </div>
  );
}
