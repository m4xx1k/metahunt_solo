import Link from "next/link";

import { trackIntro } from "@/lib/seo/feed-meta";
import { formatCountUa } from "@/lib/format";
import type { TrackDto } from "@/lib/api/tracks";
import { cn } from "@/lib/utils";

const bySortThenCount = (a: TrackDto, b: TrackDto) =>
  a.sortOrder - b.sortOrder || b.count - a.count;

// Leading disciplines get the big tiles; `sort_order` in the seed is the
// editorial ranking, not a count, so the tier never reshuffles on its own.
const TOP_TIER = 6;

function TrackTile({
  track,
  isActive,
  compact,
}: {
  track: TrackDto;
  isActive: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      // The active tile toggles back to the full market, mirroring the
      // deselect the old local-state picker had.
      href={isActive ? "/" : `/${encodeURIComponent(track.slug)}`}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden border transition-[transform,border-color,background-color,box-shadow]",
        compact ? "min-h-11 gap-0.5 p-2" : "min-h-18 p-2.5 sm:min-h-22",
        isActive
          ? "border-accent bg-accent-subtle-bg shadow-brut-2xs"
          : "border-border bg-bg-card hover:-translate-y-px hover:border-border-strong hover:bg-bg-elev hover:shadow-brut-2xs",
      )}
    >
      <strong
        className={cn(
          "block break-words font-display font-bold leading-[1.05] transition-colors group-hover:text-accent",
          compact
            ? "text-xs text-text-secondary sm:text-sm"
            : "text-sm text-text-primary sm:text-base",
        )}
      >
        {track.label}
      </strong>
      <span
        className={cn("font-mono text-2xs", compact ? "text-text-muted/70" : "text-text-muted")}
      >
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
}

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
        select track
      </h2>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {roots.slice(0, TOP_TIER).map((track) => (
          <TrackTile key={track.slug} track={track} isActive={activeRoot === track.slug} />
        ))}
      </div>

      {roots.length > TOP_TIER ? (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
          {roots.slice(TOP_TIER).map((track) => (
            <TrackTile
              key={track.slug}
              track={track}
              isActive={activeRoot === track.slug}
              compact
            />
          ))}
        </div>
      ) : null}

      {children.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
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
                  "border px-3.5 py-2 font-mono text-xs uppercase tracking-wider transition-colors sm:text-sm",
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
