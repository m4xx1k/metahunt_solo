"use client";

import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";
import { pillClass } from "@/ui/inputs/pill";
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
    <CollapsibleSection title="source" summary={summary}>
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => {
          const active = activeCode === s.code;
          return (
            <button
              key={s.code}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : s.code)}
              className={pillClass(active)}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
