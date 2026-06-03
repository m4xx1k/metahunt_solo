"use client";

import { Section } from "./Section";
import { pillClass } from "./pill";
import type { OptionRow } from "./types";

// Single-select pills for closed enum filters (seniority, work format).
// `id` carries the raw API value, never a label.

export function EnumSection({
  title,
  options,
  activeId,
  onChange,
}: {
  title: string;
  options: OptionRow[];
  activeId: string | null;
  onChange: (id: string | null) => void;
}) {
  const summary =
    activeId !== null
      ? (options.find((o) => o.id === activeId)?.label ?? "any")
      : "any";

  return (
    <Section title={title} summary={summary}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = activeId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : o.id)}
              className={pillClass(active)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
