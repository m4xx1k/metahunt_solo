"use client";

import { cn } from "@/lib/utils";
import { Section } from "./Section";
import type { SourceOption } from "./types";

export function SourceSection({
  sources,
  activeCode,
  onChange,
}: {
  sources: SourceOption[];
  activeCode: string | null;
  onChange: (code: string | null) => void;
}) {
  const summary =
    activeCode !== null
      ? (sources.find((s) => s.code === activeCode)?.label ?? "any")
      : "any";

  return (
    <Section title="source" summary={summary}>
      <div className="grid grid-cols-2 gap-2">
        {sources.map((s) => {
          const active = activeCode === s.code;
          return (
            <button
              key={s.code}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : s.code)}
              className={cn(
                "flex flex-col items-start gap-1 border px-3 py-2 text-left transition-colors",
                active
                  ? "border-accent bg-accent/5 text-accent"
                  : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary",
              )}
            >
              <span className="font-body text-xs">{s.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-text-muted">
                {s.count.toLocaleString("en-US")}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
