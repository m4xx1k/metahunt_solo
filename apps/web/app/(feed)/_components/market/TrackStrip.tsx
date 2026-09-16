import Link from "next/link";

import { trackIntro } from "@/lib/seo/feed-meta";
import { formatCountUa } from "@/lib/format";
import type { TrackDto } from "@/lib/api/tracks";
import { cn } from "@/lib/utils";

const bySortThenCount = (a: TrackDto, b: TrackDto) =>
  a.sortOrder - b.sortOrder || b.count - a.count;

type Props = {
  tracks: TrackDto[];
  activeSlug: string | null;
};

// One component for both feed states: the index (nothing chosen) and a track
// page (that discipline active, its stacks beside it). A tile is a link, so a
// track is one click away and both states share the same markup.
export function TrackStrip({ tracks, activeSlug }: Props) {
  const childrenByParent = new Map<string, TrackDto[]>();
  const parents: TrackDto[] = [];
  for (const track of tracks) {
    if (track.parentSlug == null) parents.push(track);
    else
      childrenByParent.set(track.parentSlug, [
        ...(childrenByParent.get(track.parentSlug) ?? []),
        track,
      ]);
  }

  const roots = parents
    .filter(
      (root) => root.count > 0 || (childrenByParent.get(root.slug) ?? []).some((c) => c.count > 0),
    )
    .sort(bySortThenCount);

  const active = tracks.find((track) => track.slug === activeSlug) ?? null;
  const activeRoot = active ? (active.parentSlug ?? active.slug) : null;
  const children = activeRoot
    ? (childrenByParent.get(activeRoot) ?? []).filter((c) => c.count > 0).sort(bySortThenCount)
    : [];

  return (
    <section
      aria-labelledby="track-strip-title"
      className="mx-auto w-full max-w-[1536px] px-6 py-8 lg:px-12"
    >
      <h2
        id="track-strip-title"
        className={cn(
          "font-display text-2xl font-bold text-text-primary",
          active ? "sr-only" : "mb-5",
        )}
      >
        Обери свій напрям.
      </h2>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {roots.map((track) => {
          const isActive = activeRoot === track.slug;
          return (
            <Link
              key={track.slug}
              // The active tile toggles back to the full market, mirroring the
              // deselect the old local-state picker had.
              href={isActive ? "/" : `/${encodeURIComponent(track.slug)}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex min-h-18 flex-col justify-between overflow-hidden border p-2.5 transition-[transform,border-color,background-color,box-shadow] sm:min-h-22",
                isActive
                  ? "border-accent bg-accent-subtle-bg shadow-brut-2xs"
                  : "border-border bg-bg-card hover:-translate-y-px hover:border-border-strong hover:bg-bg-elev hover:shadow-brut-2xs",
              )}
            >
              <strong className="block break-words font-display text-sm font-bold leading-[1.05] text-text-primary transition-colors group-hover:text-accent sm:text-base">
                {track.label}
              </strong>
              <span className="font-mono text-2xs text-text-muted">
                {formatCountUa(track.count)}
              </span>
              <span
                aria-hidden
                className={cn(
                  "absolute -right-5 -bottom-6 size-20 rounded-full bg-accent blur-2xl transition-opacity",
                  isActive ? "opacity-15" : "opacity-0 group-hover:opacity-10",
                )}
              />
            </Link>
          );
        })}
      </div>

      {children.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {children.map((child) => {
            const isActive = active?.slug === child.slug;
            return (
              <Link
                key={child.slug}
                href={
                  isActive
                    ? `/${encodeURIComponent(activeRoot!)}`
                    : `/${encodeURIComponent(child.slug)}`
                }
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "border px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
                  isActive
                    ? "border-accent bg-accent text-bg"
                    : "border-border text-text-secondary hover:border-accent hover:text-accent",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {active ? (
        <p className="mt-5 max-w-[80ch] font-body text-sm leading-[1.65] text-text-secondary md:text-base">
          {trackIntro(active)}
        </p>
      ) : null}
    </section>
  );
}
