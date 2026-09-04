"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { FRESHNESS_OPTIONS } from "./enum-options";
import type { FiltersApi } from "./types";

// The "how am I looking at this list" strip, inline in the results header:
// freshness window always, plus sort order + the off-stack escape hatch once a
// CV is in view (fit order and off-stack only mean something when scored). The
// off-stack toggle shows only when the full path actually hid rows — a control
// next to "0 hidden" is noise.
export function FeedListControls({
  api,
  hasViewer,
  offStackHidden,
}: {
  api: FiltersApi;
  hasViewer: boolean;
  offStackHidden: number;
}) {
  const byDate = (api.filters.sort ?? "date") === "date";
  const includeOffStack = api.filters.includeOffStack === true;
  const showOffStack = hasViewer && (offStackHidden > 0 || includeOffStack);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
      <span role="group" aria-label="freshness window" className="flex items-center gap-1.5">
        <span aria-hidden>fresh</span>
        {FRESHNESS_OPTIONS.map((o) => (
          <Pill
            key={o.id}
            active={api.filters.freshness === o.id}
            onClick={() => api.setFreshness(o.id)}
          >
            {o.label}
          </Pill>
        ))}
      </span>

      {hasViewer ? (
        <span role="group" aria-label="sort order" className="flex items-center gap-1.5">
          <span aria-hidden>sort</span>
          <Pill active={!byDate} onClick={() => api.setSort("score")}>
            fit
          </Pill>
          <Pill active={byDate} onClick={() => api.setSort("date")}>
            newest
          </Pill>
        </span>
      ) : null}

      {showOffStack ? (
        <label className="flex cursor-pointer items-center gap-1.5 text-text-secondary">
          <input
            type="checkbox"
            checked={includeOffStack}
            onChange={(e) => api.setIncludeOffStack(e.target.checked)}
            className="h-3 w-3 accent-[var(--color-accent)]"
          />
          show {offStackHidden > 0 ? `${offStackHidden} ` : ""}off-stack
        </label>
      ) : null}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border px-1.5 py-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent-subtle-bg font-bold text-accent"
          : "border-border text-text-secondary hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}
