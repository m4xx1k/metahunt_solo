"use client";

import { cn } from "@/lib/utils";

// SelectRow — a clickable list row with a marker on the left and a label.
// The marker style switches between radio (single-select, e.g. role) and
// check (multi-select, e.g. skills).

export function SelectRow({
  label,
  active,
  marker,
  onClick,
}: {
  label: string;
  active: boolean;
  marker: "radio" | "check";
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className="group grid w-full grid-cols-[auto_1fr] items-center gap-3 py-1 text-left"
      >
        <Marker active={active} kind={marker} />
        <span
          className={cn(
            "truncate font-body text-sm",
            active
              ? "text-accent"
              : "text-text-primary group-hover:text-accent",
          )}
        >
          {label}
        </span>
      </button>
    </li>
  );
}

function Marker({ active, kind }: { active: boolean; kind: "radio" | "check" }) {
  if (kind === "radio") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex h-3 w-3 items-center justify-center rounded-full border transition-colors",
          active ? "border-accent" : "border-text-muted group-hover:border-accent",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            active ? "bg-accent" : "bg-transparent",
          )}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-3 w-3 border transition-colors",
        active
          ? "border-accent bg-accent"
          : "border-text-muted group-hover:border-accent",
      )}
    />
  );
}
