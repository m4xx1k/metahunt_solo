"use client";

import { useMemo } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TrackDto } from "@/lib/api/tracks";

// Top-band track nav for /merged: disciplines + the active discipline's
// children, same tree/hide-zero rules as the sidebar TrackTree. One accent puck
// (shared layoutId) slides to the selected pill. Counts are intentionally
// omitted — an all-time pill count over-promised vs the freshness-windowed feed.
const bySortThenCount = (a: TrackDto, b: TrackDto) =>
  a.sortOrder - b.sortOrder || b.count - a.count;

// matches --animate-sheet-up easing elsewhere in the app (PipelineCard, etc.)
const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.6 } as const;

const SCROLL_ROW =
  "flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto scroll-px-3 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border";

export function TracksBand({
  tracks,
  activeSlug,
  onSelect,
}: {
  tracks: TrackDto[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
}) {
  const reduceMotion = useReducedMotion();

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
  const parentLabel =
    activeParent != null
      ? (tracks.find((t) => t.slug === activeParent)?.label ?? "")
      : "";

  return (
    <nav aria-label="tracks" className="flex flex-col gap-2">
      <p className="font-mono text-2xs uppercase tracking-[0.18em] text-text-muted">
        Browse by track
      </p>
      <LayoutGroup id="tracks-band">
        <div className="flex items-stretch gap-2">
          <AllPill
            active={activeSlug == null}
            onClick={() => onSelect(null)}
            reduceMotion={!!reduceMotion}
          />
          <span aria-hidden className="w-px shrink-0 self-stretch bg-border" />
          <div className={SCROLL_ROW}>
            {visibleRoots.map((disc) => (
              <DisciplinePill
                key={disc.slug}
                label={disc.label}
                isExact={activeSlug === disc.slug}
                isGroupFocus={
                  activeParent === disc.slug && activeSlug !== disc.slug
                }
                ariaPressed={activeParent === disc.slug}
                onClick={() => onSelect(disc.slug)}
                reduceMotion={!!reduceMotion}
              />
            ))}
          </div>
        </div>

        {kids.length > 0 ? (
          <div className="flex items-stretch gap-2 pl-1">
            <span className="flex shrink-0 items-center gap-1.5 self-center font-mono text-2xs uppercase tracking-wider text-text-muted">
              <span aria-hidden>↳</span>
              {parentLabel}
            </span>
            <span aria-hidden className="w-px shrink-0 self-stretch bg-border" />
            <div className={SCROLL_ROW}>
              {kids.map((kid) => (
                <ChildPill
                  key={kid.slug}
                  label={kid.label}
                  isExact={activeSlug === kid.slug}
                  onClick={() => onSelect(kid.slug)}
                  reduceMotion={!!reduceMotion}
                />
              ))}
            </div>
          </div>
        ) : null}
      </LayoutGroup>
    </nav>
  );
}

function AllPill({
  active,
  onClick,
  reduceMotion,
}: {
  active: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center gap-2 border px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-[transform,color,border-color] duration-150",
        active
          ? "border-transparent text-bg"
          : "border-border bg-bg text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {active ? (
        <motion.span
          layoutId="tracks-puck"
          transition={reduceMotion ? { duration: 0 } : SPRING}
          className="absolute inset-0 bg-accent shadow-brut-sm"
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative z-10 grid shrink-0 grid-cols-2 gap-[2px]",
          active ? "opacity-90" : "opacity-60",
        )}
      >
        <span className="h-[3px] w-[3px] bg-current" />
        <span className="h-[3px] w-[3px] bg-current" />
        <span className="h-[3px] w-[3px] bg-current" />
        <span className="h-[3px] w-[3px] bg-current" />
      </span>
      <span className="relative z-10">all</span>
    </button>
  );
}

function DisciplinePill({
  label,
  isExact,
  isGroupFocus,
  ariaPressed,
  onClick,
  reduceMotion,
}: {
  label: string;
  isExact: boolean;
  isGroupFocus: boolean;
  ariaPressed: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={ariaPressed}
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center border px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-[transform,color,border-color,background-color] duration-150",
        isExact
          ? "border-transparent text-bg"
          : isGroupFocus
            ? "border-accent bg-accent-subtle-bg text-accent"
            : "border-border bg-bg text-text-secondary hover:-translate-y-[2px] hover:border-border-strong hover:text-text-primary",
      )}
    >
      {isExact ? (
        <motion.span
          layoutId="tracks-puck"
          transition={reduceMotion ? { duration: 0 } : SPRING}
          className="absolute inset-0 bg-accent shadow-brut-sm"
        />
      ) : null}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function ChildPill({
  label,
  isExact,
  onClick,
  reduceMotion,
}: {
  label: string;
  isExact: boolean;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={isExact}
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 items-center border px-2.5 py-1.5 font-mono text-2xs uppercase tracking-wider transition-colors duration-150",
        isExact
          ? "border-transparent text-bg"
          : "border-border bg-bg text-text-secondary hover:border-accent hover:text-accent",
      )}
    >
      {isExact ? (
        <motion.span
          layoutId="tracks-puck"
          transition={reduceMotion ? { duration: 0 } : SPRING}
          className="absolute inset-0 bg-accent shadow-brut-2xs"
        />
      ) : null}
      <span className="relative z-10">{label}</span>
    </button>
  );
}
