"use client";

import { Section } from "./Section";
import { pillClass } from "./pill";
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
    </Section>
  );
}
