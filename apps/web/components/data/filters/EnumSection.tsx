"use client";

import { Section } from "./Section";
import { pillClass } from "./pill";
import type { OptionRow } from "./types";

// Pills for closed enum filters (seniority, work format…). `id` carries the raw
// API value, never a label. Two modes, backward-compatible:
//   single (default): `activeId` + `onChange(id|null)` — one or none (feed).
//   multi (`multiple`): `activeIds` + `onToggle(id)` — any subset, OR-semantics
//     (reverse-ATS, where e.g. middle ∪ senior is a valid filter).
export function EnumSection({
  title,
  options,
  activeId = null,
  onChange,
  multiple = false,
  activeIds = [],
  onToggle,
}: {
  title: string;
  options: OptionRow[];
  activeId?: string | null;
  onChange?: (id: string | null) => void;
  multiple?: boolean;
  activeIds?: string[];
  onToggle?: (id: string) => void;
}) {
  const isActive = (id: string) =>
    multiple ? activeIds.includes(id) : activeId === id;

  const summary = multiple
    ? activeIds.length > 0
      ? activeIds
          .map((id) => options.find((o) => o.id === id)?.label ?? id)
          .join(", ")
      : "any"
    : activeId !== null
      ? (options.find((o) => o.id === activeId)?.label ?? "any")
      : "any";

  const handle = (id: string, active: boolean) => {
    if (multiple) onToggle?.(id);
    else onChange?.(active ? null : id);
  };

  return (
    <Section title={title} summary={summary}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = isActive(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => handle(o.id, active)}
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
