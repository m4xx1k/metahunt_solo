"use client";

import { cn } from "@/lib/utils";
import { Section } from "./Section";
import type { FlagDistribution } from "./types";

// FlagSection — generic tri-state filter for boolean fields. Used by both
// "test task" and "reservation": the shape is identical (yes / no / any),
// only the title and distribution differ.

interface Option {
  key: "any" | "yes" | "no";
  label: string;
  count: number | null;
  v: boolean | null;
}

export function FlagSection({
  title,
  value,
  onChange,
  agg,
}: {
  title: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  agg: FlagDistribution;
}) {
  const summary = value === null ? "any" : value ? "yes" : "no";
  const options: Option[] = [
    { key: "any", label: "any", count: null, v: null },
    { key: "yes", label: "yes", count: agg.yes, v: true },
    { key: "no", label: "no", count: agg.no, v: false },
  ];

  return (
    <Section title={title} summary={summary}>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.v)}
              className={cn(
                "flex flex-col items-start gap-1 border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-accent bg-accent/5 text-accent"
                  : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
              )}
            >
              <span className="font-body text-xs">{o.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-text-muted">
                {o.count === null ? "—" : o.count.toLocaleString("en-US")}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
