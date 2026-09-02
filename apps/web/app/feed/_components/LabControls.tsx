"use client";

import { cn } from "@/lib/utils";
import type { FiltersApi } from "@/features/vacancy-filters/types";
import { LAB_INCLUDE_OFF_STACK } from "@/features/vacancy-filters/warm-query";

// Sort + the off-stack escape hatch. The toggle only exists when something is
// actually hidden: an unhide control next to "0 hidden" is noise.
export function LabControls({
  api,
  defaultSort,
  offStackHidden,
  disabled = false,
}: {
  api: FiltersApi;
  /** The lens's order when the user hasn't chosen one (§8.1: cold → "date",
   *  warm → "score"). Drives which button reads as active for `sort === null`. */
  defaultSort: "score" | "date";
  offStackHidden: number;
  disabled?: boolean;
}) {
  // `null` = untouched → the lens default; only "score"/"date" are explicit.
  const effectiveSort = api.filters.sort ?? defaultSort;
  const byDate = effectiveSort === "date";
  const includeOffStack = api.filters.includeOffStack ?? LAB_INCLUDE_OFF_STACK;
  const showOffStackToggle = offStackHidden > 0 || includeOffStack;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 border border-border bg-bg-card px-4 py-2.5 font-mono text-2xs uppercase tracking-wider",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="text-text-muted">sort</span>
        <SortButton active={!byDate} onClick={() => api.setSort("score")}>
          fit
        </SortButton>
        <SortButton active={byDate} onClick={() => api.setSort("date")}>
          newest
        </SortButton>
      </span>

      {showOffStackToggle ? (
        <label className="flex cursor-pointer items-center gap-2 text-text-secondary">
          <input
            type="checkbox"
            checked={includeOffStack}
            onChange={(e) => api.setIncludeOffStack(e.target.checked)}
            className="h-3 w-3 accent-[var(--color-accent)]"
          />
          show {offStackHidden > 0 ? `${offStackHidden} ` : ""}other-stack jobs
        </label>
      ) : null}
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent-subtle-bg font-bold text-accent"
          : "border-border text-text-secondary hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}
