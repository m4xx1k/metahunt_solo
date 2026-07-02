"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";
import { chipClass } from "./pill";
import type { SelectOption } from "./types";

const DEFAULT_MAX = 8;

const byCount = (a: SelectOption, b: SelectOption) =>
  (b.count ?? 0) - (a.count ?? 0);

// Generic searchable multi-select rendered as toggle chips inside a
// CollapsibleSection. Domain-free: callers map their own data into
// SelectOption and own the `selected` ids. Two behaviours matter:
//   - Selected chips are always rendered (pinned above the suggestions), so an
//     active choice never disappears while the user searches for another one.
//   - A selected id absent from the current `options` (e.g. it dropped out of
//     the live aggregate) still renders its chip via `selectedOptions`, then a
//     bare id fallback — selection survives a shrinking option pool.
// `extra` is an open slot below the chips for a caller-owned control (e.g. a
// nice-to-have toggle); the widget stays unaware of its meaning.
export function MultiSelect({
  title,
  options,
  selected,
  onToggle,
  selectedOptions,
  searchable = false,
  searchPlaceholder = "search…",
  max = DEFAULT_MAX,
  extra,
}: {
  title: string;
  options: SelectOption[];
  selected: string[];
  onToggle: (id: string) => void;
  selectedOptions?: SelectOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  max?: number;
  extra?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const q = query.trim().toLowerCase();

  const selectedChips = useMemo(() => {
    const byId = new Map<string, SelectOption>();
    for (const o of options) byId.set(o.id, o);
    for (const o of selectedOptions ?? []) if (!byId.has(o.id)) byId.set(o.id, o);
    return selected.map((id) => byId.get(id) ?? { id, label: id });
  }, [options, selectedOptions, selected]);

  const rest = useMemo(() => {
    const sel = new Set(selected);
    return options.filter((o) => !sel.has(o.id)).sort(byCount);
  }, [options, selected]);

  const filteredRest = useMemo(() => {
    if (q.length === 0) return rest;
    return rest.filter((o) => o.label.toLowerCase().includes(q));
  }, [rest, q]);

  const visibleRest =
    q.length > 0 || showAll ? filteredRest : filteredRest.slice(0, max);
  const hiddenCount = filteredRest.length - visibleRest.length;

  const summary = selected.length > 0 ? `${selected.length} selected` : "any";
  const showNoMatches = q.length > 0 && filteredRest.length === 0;

  return (
    <CollapsibleSection title={title} summary={summary}>
      <div className="flex flex-col gap-3">
        {searchable ? (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {selectedChips.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed
              onClick={() => onToggle(o.id)}
              className={chipClass(true)}
            >
              {o.label}
            </button>
          ))}
          {visibleRest.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={false}
              onClick={() => onToggle(o.id)}
              className={chipClass(false)}
            >
              {o.label}
            </button>
          ))}
          {showNoMatches ? (
            <p className="py-1 font-mono text-xs text-text-muted">no matches</p>
          ) : null}
        </div>

        {q.length === 0 && hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="self-start font-mono text-2xs uppercase tracking-wider text-text-secondary hover:text-accent"
          >
            [+ {hiddenCount} more]
          </button>
        ) : null}
        {q.length === 0 && showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="self-start font-mono text-2xs uppercase tracking-wider text-text-secondary hover:text-accent"
          >
            [− collapse]
          </button>
        ) : null}

        {extra}
      </div>
    </CollapsibleSection>
  );
}
