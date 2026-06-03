"use client";

import { Section } from "./Section";
import { pillClass } from "./pill";

// FlagSection — generic tri-state filter for boolean fields. Used by both
// "test task" and "reservation": the shape is identical (any / yes / no),
// only the title differs.

interface Option {
  key: "any" | "yes" | "no";
  label: string;
  v: boolean | null;
}

const OPTIONS: Option[] = [
  { key: "any", label: "any", v: null },
  { key: "yes", label: "yes", v: true },
  { key: "no", label: "no", v: false },
];

export function FlagSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const summary = value === null ? "any" : value ? "yes" : "no";

  return (
    <Section title={title} summary={summary}>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.v)}
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
