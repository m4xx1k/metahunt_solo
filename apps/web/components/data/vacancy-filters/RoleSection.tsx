"use client";

import { useState } from "react";
import { Section } from "./Section";
import { SelectRow } from "./SelectRow";
import type { OptionRow } from "./types";

const TOP_N = 6;

export function RoleSection({
  roles,
  activeId,
  onChange,
}: {
  roles: OptionRow[];
  activeId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? roles : roles.slice(0, TOP_N);
  const hiddenCount = roles.length - visible.length;
  const summary =
    activeId !== null
      ? (roles.find((r) => r.id === activeId)?.label ?? "any")
      : "any";

  return (
    <Section title="role" summary={summary}>
      <div className="flex flex-col">
        <ul className="flex flex-col">
          {visible.map((r) => (
            <SelectRow
              key={r.id}
              label={r.label}
              count={r.count}
              active={activeId === r.id}
              marker="radio"
              onClick={() => onChange(activeId === r.id ? null : r.id)}
            />
          ))}
        </ul>
        {roles.length > TOP_N ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="self-start py-2 font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-accent"
          >
            {showAll ? "[− collapse]" : `[+ ${hiddenCount} more]`}
          </button>
        ) : null}
      </div>
    </Section>
  );
}
