"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TrackDto } from "@/lib/api/tracks";

// Top-band track nav for /merged: disciplines on one row, the active
// discipline's children on a second. Same tree/hide-zero rules as the sidebar
// TrackTree, laid out horizontally. Mobile gets this as a bottom sheet in PR4.
const bySortThenCount = (a: TrackDto, b: TrackDto) =>
  a.sortOrder - b.sortOrder || b.count - a.count;

export function TracksBand({
  tracks,
  activeSlug,
  onSelect,
}: {
  tracks: TrackDto[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
}) {
  const { roots, childrenOf } = useMemo(() => {
    const children = new Map<string, TrackDto[]>();
    const tops: TrackDto[] = [];
    for (const t of tracks) {
      if (t.parentSlug == null) tops.push(t);
      else {
        const arr = children.get(t.parentSlug) ?? [];
        arr.push(t);
        children.set(t.parentSlug, arr);
      }
    }
    return {
      roots: tops.slice().sort(bySortThenCount),
      childrenOf: (slug: string) =>
        (children.get(slug) ?? []).filter((c) => c.count > 0).sort(bySortThenCount),
    };
  }, [tracks]);

  const visibleRoots = roots.filter(
    (r) => r.count > 0 || childrenOf(r.slug).length > 0,
  );

  // The discipline whose children to expand: the active node's parent, or the
  // active root itself.
  const activeParent = useMemo(() => {
    if (activeSlug == null) return null;
    const node = tracks.find((t) => t.slug === activeSlug);
    return node?.parentSlug ?? activeSlug;
  }, [tracks, activeSlug]);

  const kids = activeParent ? childrenOf(activeParent) : [];

  return (
    <nav aria-label="tracks" className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Chip active={activeSlug == null} onClick={() => onSelect(null)}>
          усі
        </Chip>
        {visibleRoots.map((disc) => (
          <Chip
            key={disc.slug}
            active={activeParent === disc.slug}
            count={disc.count}
            onClick={() => onSelect(disc.slug)}
          >
            {disc.label}
          </Chip>
        ))}
      </div>
      {kids.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-l-2 border-border/60 pl-3">
          {kids.map((kid) => (
            <Chip
              key={kid.slug}
              active={activeSlug === kid.slug}
              count={kid.count}
              onClick={() => onSelect(kid.slug)}
              subtle
            >
              {kid.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

function Chip({
  active,
  count,
  subtle = false,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  subtle?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-2xs uppercase tracking-wider transition-colors",
        active
          ? "border-accent bg-accent text-bg"
          : "border-border bg-bg-card text-text-secondary hover:border-accent hover:text-accent",
        subtle && !active && "text-text-muted",
      )}
    >
      <span>{children}</span>
      {count != null ? (
        <span className="tabular-nums opacity-70">{count}</span>
      ) : null}
    </button>
  );
}
