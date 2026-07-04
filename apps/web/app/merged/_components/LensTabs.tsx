"use client";

import { cn } from "@/lib/utils";
import { useAnalytics, type Lens } from "@/lib/hooks/use-analytics";

// The feed/CV lens switch. Warm is locked until a CV resolves (`cvLocked`);
// colour is never the only signal — the locked tab carries a lock glyph.
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

  const select = (to: Lens) => {
    if (to === lens) return;
    if (to === "warm" && cvLocked) return;
    analytics.lensSwitched(lens, to);
    onSelect(to);
  };

  return (
    <div
      role="tablist"
      aria-label="feed lens"
      className="flex items-stretch gap-0 border border-border bg-bg-card font-mono text-2xs uppercase tracking-wider"
    >
      <Tab active={lens === "cold"} onClick={() => select("cold")}>
        вакансії
      </Tab>
      <Tab
        active={lens === "warm"}
        disabled={cvLocked}
        onClick={() => select("warm")}
      >
        під моє CV{cvLocked ? " \u{1F512}" : ""}
      </Tab>
    </div>
  );
}

function Tab({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      className={cn(
        "flex-1 border-r border-border px-4 py-2 transition-colors last:border-r-0",
        active
          ? "bg-accent text-bg"
          : "text-text-secondary hover:text-accent",
        disabled && "cursor-not-allowed text-text-muted hover:text-text-muted",
      )}
    >
      {children}
    </button>
  );
}
