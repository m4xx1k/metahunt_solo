"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "./CollapsibleSection";
import type { TrackDto } from "@/lib/api/tracks";

// Nested browse tree (disciplines → stack/language children) that replaces
// the flat RoleSection. Single-select: one active track drives the feed.
// Counts are per-track and inherited (a child's count == what selecting it
// returns) — never summed. hide-zero: drop a node with count===0 unless it
// has a visible child (so pure-grouping disciplines like "By Language" stay).
// Sort by sortOrder, then count desc. See taxonomy-navigation.md.
//
// Selecting a discipline filters immediately; the chevron expands its
// children for refinement. Built standalone rather than via SelectRow: the
// two-level layout needs a per-row chevron + trailing count, which the flat
// SelectRow `<li>` doesn't carry (and nesting `<li>` would be invalid).

export function TrackTree({
  tracks,
  activeSlug,
  onSelect,
}: {
  tracks: TrackDto[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const bySortThenCount = (a: TrackDto, b: TrackDto) =>
    a.sortOrder - b.sortOrder || b.count - a.count;

  const { roots, childrenOf } = useMemo(() => {
    const children = new Map<string, TrackDto[]>();
    const tops: TrackDto[] = [];
    for (const t of tracks) {
      if (t.parentSlug == null) {
        tops.push(t);
        continue;
      }
      const arr = children.get(t.parentSlug) ?? [];
      arr.push(t);
      children.set(t.parentSlug, arr);
    }
    return {
      roots: tops.slice().sort(bySortThenCount),
      childrenOf: (slug: string) =>
        (children.get(slug) ?? [])
          .filter((c) => c.count > 0) // leaves have no children → hide-zero
          .sort(bySortThenCount),
    };
  }, [tracks]);

  // hide-zero for disciplines: keep if it matches anything itself OR groups
  // visible children (e.g. a count-0 "By Language" parent with live langs).
  const visibleRoots = roots.filter(
    (r) => r.count > 0 || childrenOf(r.slug).length > 0,
  );

  const activeParent = useMemo(() => {
    if (activeSlug == null) return null;
    const node = tracks.find((t) => t.slug === activeSlug);
    return node?.parentSlug ?? activeSlug; // a root is its own group
  }, [tracks, activeSlug]);

  const [open, setOpen] = useState<Set<string>>(() =>
    activeParent ? new Set([activeParent]) : new Set(),
  );

  const toggleOpen = (slug: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const activeLabel =
    activeSlug != null
      ? (tracks.find((t) => t.slug === activeSlug)?.label ?? "any")
      : "any";

  return (
    <CollapsibleSection title="track" summary={activeLabel}>
      <ul className="flex flex-col">
        {visibleRoots.map((disc) => {
          const kids = childrenOf(disc.slug);
          const isOpen = open.has(disc.slug);
          return (
            <li key={disc.slug}>
              <TrackRow
                label={disc.label}
                count={disc.count}
                active={activeSlug === disc.slug}
                expandable={kids.length > 0}
                expanded={isOpen}
                onToggle={() => toggleOpen(disc.slug)}
                onSelect={() => onSelect(disc.slug)}
              />
              {isOpen && kids.length > 0 ? (
                <ul className="flex flex-col border-l border-border/60 pl-3">
                  {kids.map((kid) => (
                    <li key={kid.slug}>
                      <TrackRow
                        label={kid.label}
                        count={kid.count}
                        active={activeSlug === kid.slug}
                        expandable={false}
                        onSelect={() => onSelect(kid.slug)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}

function TrackRow({
  label,
  count,
  active,
  expandable,
  expanded,
  onToggle,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  expandable: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 py-1">
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "collapse" : "expand"}
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex h-3 w-3 items-center justify-center font-mono text-[10px] text-text-muted hover:text-accent"
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span aria-hidden className="h-3 w-3" />
      )}

      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className="group grid grid-cols-[auto_1fr] items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-3 w-3 items-center justify-center rounded-full border transition-colors",
            active
              ? "border-accent"
              : "border-text-muted group-hover:border-accent",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              active ? "bg-accent" : "bg-transparent",
            )}
          />
        </span>
        <span
          className={cn(
            "truncate font-body text-sm",
            active ? "text-accent" : "text-text-primary group-hover:text-accent",
          )}
        >
          {label}
        </span>
      </button>

      <span className="font-mono text-[11px] tabular-nums text-text-muted">
        {count}
      </span>
    </div>
  );
}
