"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import type { StatsPeriod } from "@/lib/api/monitoring";

const OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: "24h", label: "24 години" },
  { value: "week", label: "7 днів" },
  { value: "all", label: "весь час" },
];

export function PeriodSelector({ current }: { current: StatsPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: StatsPeriod) {
    if (next === current) return;
    const sp = new URLSearchParams(params);
    if (next === "24h") sp.delete("period");
    else sp.set("period", next);
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div
      className="inline-flex border border-border bg-bg-card shadow-brut"
      role="tablist"
      aria-label="період"
      data-pending={pending}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => select(opt.value)}
            className={cn(
              "px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
              active
                ? "bg-text-primary text-bg"
                : "text-text-secondary hover:text-accent",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
