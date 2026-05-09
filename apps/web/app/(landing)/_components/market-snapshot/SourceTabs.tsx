"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import type { AggregateSourceCount } from "@/lib/api/aggregates";

type Props = {
  sources: AggregateSourceCount[];
  /** Either a source code (e.g. "djinni") or `SOURCE_TABS_ALL`. */
  selected: string;
};

const ALL_KEY = "all";

export function SourceTabs({ sources, selected }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const tabs: Array<{ code: string; label: string; count: number }> = [
    {
      code: ALL_KEY,
      label: "all",
      count: sources.reduce((sum, s) => sum + s.count, 0),
    },
    ...sources.map((s) => ({
      code: s.code,
      label: s.displayName.trim(),
      count: s.count,
    })),
  ];

  const handleSelect = (code: string) => {
    if (code === selected) return;
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (code === ALL_KEY) {
      next.delete("source");
    } else {
      next.set("source", code);
    }
    // Filter context just changed; current page/offset is meaningless.
    next.delete("offset");
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider transition-opacity",
        isPending && "opacity-50",
      )}
    >
      {tabs.map((t) => {
        const active = selected === t.code;
        return (
          <button
            key={t.code}
            type="button"
            onClick={() => handleSelect(t.code)}
            disabled={isPending}
            className={cn(
              "inline-flex items-center gap-2 border px-3 py-1.5 transition-colors",
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
              isPending && "cursor-wait",
            )}
            aria-pressed={active}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "tabular-nums",
                active ? "text-accent/80" : "text-text-muted",
              )}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const SOURCE_TABS_ALL = ALL_KEY;
