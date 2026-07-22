"use client";

import { forwardRef, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useAnalytics, type Lens } from "@/lib/hooks/use-analytics";
import { Badge } from "@/ui";

// Ids shared with the lens tabpanel in the feed shell so the tablist ↔ panel
// ARIA relationship resolves.
export const LENS_PANEL_ID = "lens-panel";
const TAB_ID: Record<Lens, string> = { cold: "lens-tab-cold", warm: "lens-tab-warm" };
export const lensTabId = (lens: Lens) => TAB_ID[lens];

// The feed/CV lens switch — a WAI-ARIA tablist. Roving tabindex + Arrow/Home/End
// move focus; Enter/Space (native button) activates. Warm is locked until a CV
// resolves; colour is never the only signal — the locked tab carries a lock glyph.
export function LensTabs({
  lens,
  cvLocked,
  onSelect,
}: {
  lens: Lens;
  cvLocked: boolean;
  onSelect: (lens: Lens) => void;
}) {
  const analytics = useAnalytics();
  const coldRef = useRef<HTMLButtonElement>(null);
  const warmRef = useRef<HTMLButtonElement>(null);

  const select = (to: Lens) => {
    if (to === lens || (to === "warm" && cvLocked)) return;
    analytics.lensSwitched(lens, to);
    onSelect(to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const toWarm = e.key === "ArrowRight" || e.key === "End";
    const toCold = e.key === "ArrowLeft" || e.key === "Home";
    if (!toWarm && !toCold) return;
    e.preventDefault();
    (toWarm ? warmRef : coldRef).current?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Job view"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex items-stretch self-start border border-border font-mono text-2xs uppercase tracking-wider"
    >
      <Tab ref={coldRef} lens="cold" active={lens === "cold"} onClick={() => select("cold")}>
        All jobs
      </Tab>
      <Tab
        ref={warmRef}
        lens="warm"
        active={lens === "warm"}
        disabled={cvLocked}
        onClick={() => select("warm")}
      >
        Your matches{cvLocked ? " \u{1F512}" : ""}{" "}
        <Badge variant="dark" className="px-1.5 py-0.5 align-middle">
          beta
        </Badge>
      </Tab>
    </div>
  );
}

const Tab = forwardRef<
  HTMLButtonElement,
  {
    lens: Lens;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
  }
>(function Tab({ lens, active, disabled = false, onClick, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={TAB_ID[lens]}
      aria-selected={active}
      aria-controls={LENS_PANEL_ID}
      aria-disabled={disabled || undefined}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        "border-r border-border px-4 py-2 transition-colors last:border-r-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        active
          ? "bg-accent-subtle-bg font-bold text-accent shadow-[inset_0_-2px_0_0_var(--color-accent)]"
          : "text-text-secondary hover:text-accent",
        disabled && "cursor-not-allowed text-text-muted hover:text-text-muted",
      )}
    >
      {children}
    </button>
  );
});
