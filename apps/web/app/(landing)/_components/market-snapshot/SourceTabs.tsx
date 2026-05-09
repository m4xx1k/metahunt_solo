"use client";

import { cn } from "@/lib/utils";
import type { AggregateSourceCount } from "@/lib/api/aggregates";

type Props = {
  sources: AggregateSourceCount[];
  selected: string;
  onSelect: (code: string) => void;
};

const ALL_KEY = "all";

export function SourceTabs({ sources, selected, onSelect }: Props) {
  const tabs: Array<{ code: string; label: string; count: number | null }> = [
    {
      code: ALL_KEY,
      label: "all",
      count: sources.reduce((sum, s) => sum + s.count, 0),
    },
    ...sources.map((s) => ({
      code: s.code,
      label: s.displayName,
      count: s.count,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider">
      {tabs.map((t) => {
        const active = selected === t.code;
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onSelect(t.code)}
            className={cn(
              "inline-flex items-center gap-2 border px-3 py-1.5 transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
            )}
            aria-pressed={active}
          >
            <span>{t.label}</span>
            {t.count != null ? (
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-accent/80" : "text-text-muted",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const SOURCE_TABS_ALL = ALL_KEY;
