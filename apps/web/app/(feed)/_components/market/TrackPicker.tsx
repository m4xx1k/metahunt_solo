"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatCountUa, formatKyivTime } from "@/lib/format";
import type { TrackDto } from "@/lib/api/tracks";
import { cn } from "@/lib/utils";

const bySortThenCount = (a: TrackDto, b: TrackDto) =>
  a.sortOrder - b.sortOrder || b.count - a.count;

type Props = {
  tracks: TrackDto[];
  activeSlug: string | null;
  lastSyncAt: string | null;
};

// A compact market map. Selecting a tile is intentionally local: it lets a
// visitor compare directions before deciding whether to open the filtered feed.
export function TrackPicker({ tracks, activeSlug, lastSyncAt }: Props) {
  const { roots, childrenByParent, activeParent } = useMemo(() => {
    const children = new Map<string, TrackDto[]>();
    const parentTracks: TrackDto[] = [];
    for (const track of tracks) {
      if (track.parentSlug == null) parentTracks.push(track);
      else children.set(track.parentSlug, [...(children.get(track.parentSlug) ?? []), track]);
    }
    const sortedRoots = parentTracks
      .filter(
        (root) =>
          root.count > 0 || (children.get(root.slug) ?? []).some((child) => child.count > 0),
      )
      .sort(bySortThenCount);
    const active = tracks.find((track) => track.slug === activeSlug);
    return {
      roots: sortedRoots,
      childrenByParent: children,
      activeParent: active?.parentSlug ?? active?.slug ?? null,
    };
  }, [activeSlug, tracks]);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(activeParent);
  const [selectedChildSlug, setSelectedChildSlug] = useState<string | null>(
    activeSlug && activeSlug !== activeParent ? activeSlug : null,
  );

  const selected = roots.find((track) => track.slug === selectedSlug) ?? null;
  const children = selected
    ? (childrenByParent.get(selected.slug) ?? [])
        .filter((track) => track.count > 0)
        .sort(bySortThenCount)
    : [];
  const selectedChild = children.find((track) => track.slug === selectedChildSlug) ?? null;
  const visibleChildren = children.slice(0, 8);

  return (
    <section aria-labelledby="track-picker-title">
      <div className="mx-auto w-full max-w-[1536px] px-6 py-8 lg:px-12">
        <div className="mb-5 flex flex-col gap-1">
          <h2 id="track-picker-title" className="font-display text-2xl font-bold text-text-primary">
            Обери свій напрям.
          </h2>
          <p className="font-mono text-2xs uppercase tracking-[0.14em] text-text-muted">
            Тисни — розкриємо стек.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(290px,0.36fr)]">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
            {roots.map((track, index) => {
              const selectedTile = selected?.slug === track.slug;
              return (
                <button
                  key={track.slug}
                  type="button"
                  aria-pressed={selectedTile}
                  onClick={() => {
                    if (selectedSlug === track.slug) {
                      setSelectedSlug(null);
                      setSelectedChildSlug(null);
                    } else {
                      setSelectedSlug(track.slug);
                      setSelectedChildSlug(null);
                    }
                  }}
                  className={cn(
                    "group relative min-h-18 overflow-hidden border p-2 text-left transition-[transform,border-color,background-color,box-shadow] sm:min-h-22",
                    index === 0 && "col-span-2",
                    selectedTile
                      ? "border-accent bg-accent-subtle-bg shadow-brut-2xs"
                      : "border-border bg-bg-card hover:-translate-y-px hover:border-border-strong hover:bg-bg-elev hover:shadow-brut-2xs",
                  )}
                >
                  <span className="font-mono text-[9px] text-text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong className="mt-1 block break-words font-display text-sm font-bold leading-[1.05] text-text-primary transition-colors group-hover:text-accent sm:text-base">
                    {track.label}
                  </strong>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -right-5 -bottom-6 size-20 rounded-full bg-accent blur-2xl transition-opacity",
                      selectedTile ? "opacity-15" : "opacity-0 group-hover:opacity-10",
                    )}
                  />
                </button>
              );
            })}
          </div>

          <aside
            aria-live="polite"
            className={cn(
              "relative overflow-hidden border p-4",
              selected ? "border-accent bg-bg-card" : "border-border bg-bg-card/70",
            )}
          >
            <span aria-hidden className="absolute top-0 right-0 h-px w-16 bg-accent" />
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent">
                      обраний ринок
                    </p>
                    <h3 className="mt-1 font-display text-2xl font-bold text-text-primary">
                      {selected.label}
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-text-secondary">
                    {formatCountUa(selected.count)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {visibleChildren.map((child) => (
                    <button
                      key={child.slug}
                      type="button"
                      aria-pressed={selectedChild?.slug === child.slug}
                      onClick={() => setSelectedChildSlug(child.slug)}
                      className={cn(
                        "border px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
                        selectedChild?.slug === child.slug
                          ? "border-accent bg-accent text-bg"
                          : "border-border text-text-secondary hover:border-accent hover:text-accent",
                      )}
                    >
                      {child.label}
                    </button>
                  ))}
                  {children.length > visibleChildren.length ? (
                    <span className="px-1 py-1 font-mono text-2xs text-text-muted">
                      +{children.length - visibleChildren.length}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end justify-between gap-4 border-t border-border pt-3">
                  <span className="font-mono text-2xs text-text-muted">
                    sync {formatKyivTime(lastSyncAt)}
                  </span>
                  <Link
                    href={`/${encodeURIComponent(selectedChild?.slug ?? selected.slug)}`}
                    className="font-mono text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:text-text-primary"
                  >
                    дивитись →
                  </Link>
                </div>
              </>
            ) : (
              <div aria-hidden className="flex min-h-28 items-end gap-1.5">
                <span className="h-3 w-8 bg-border" />
                <span className="h-6 w-12 bg-border-strong" />
                <span className="h-10 w-7 bg-accent/35" />
                <span className="h-5 w-16 bg-border" />
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
