"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { TrackDto } from "@/lib/api/tracks";
import { cn } from "@/lib/utils";

const bySortThenCount = (a: TrackDto, b: TrackDto) =>
  a.sortOrder - b.sortOrder || b.count - a.count;

// The entry point for browsing the market. It deliberately mirrors the radar's
// direct, track-first choice, while retaining the feed URL (and its filters).
export function TrackPicker({
  tracks,
  activeSlug,
}: {
  tracks: TrackDto[];
  activeSlug: string | null;
}) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const hrefFor = (slug: string | null) => {
    const path = slug ? `/${encodeURIComponent(slug)}` : "/";
    return query ? `${path}?${query}` : path;
  };

  const children = new Map<string, TrackDto[]>();
  const roots: TrackDto[] = [];
  for (const track of tracks) {
    if (track.parentSlug == null) roots.push(track);
    else children.set(track.parentSlug, [...(children.get(track.parentSlug) ?? []), track]);
  }

  const visibleRoots = roots
    .filter(
      (root) => root.count > 0 || (children.get(root.slug) ?? []).some((child) => child.count > 0),
    )
    .sort(bySortThenCount);

  return (
    <section aria-labelledby="track-picker-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-text-muted">
            обери напрям
          </p>
          <h2
            id="track-picker-title"
            className="mt-2 font-display text-2xl font-bold text-text-primary"
          >
            Який ринок дивимось?
          </h2>
        </div>
        <Link
          href={hrefFor(null)}
          className={cn(
            "border px-3 py-2 font-mono text-2xs uppercase tracking-wider transition-colors",
            activeSlug == null
              ? "border-accent bg-accent text-bg shadow-brut-2xs"
              : "border-border text-text-secondary hover:border-accent hover:text-accent",
          )}
        >
          весь ринок
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleRoots.map((root) => {
          const rootChildren = (children.get(root.slug) ?? [])
            .filter((child) => child.count > 0)
            .sort(bySortThenCount);
          const selected =
            activeSlug === root.slug || rootChildren.some((child) => child.slug === activeSlug);

          return (
            <article
              key={root.slug}
              className={cn(
                "border bg-bg-card p-4 shadow-brut-sm transition-[transform,border-color,box-shadow]",
                selected
                  ? "border-accent bg-accent-subtle-bg shadow-brut"
                  : "border-border hover:-translate-y-0.5 hover:border-border-strong hover:shadow-brut",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <Link href={hrefFor(root.slug)} className="group min-w-0">
                  <h3 className="font-display text-xl font-bold text-text-primary transition-colors group-hover:text-accent">
                    {root.label}
                  </h3>
                  <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
                    дивитись вакансії →
                  </p>
                </Link>
                <span className="shrink-0 font-mono text-xs text-text-secondary">
                  {root.count.toLocaleString("uk-UA")}
                </span>
              </div>

              {rootChildren.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {rootChildren.map((child) => (
                    <Link
                      key={child.slug}
                      href={hrefFor(child.slug)}
                      className={cn(
                        "border px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors",
                        activeSlug === child.slug
                          ? "border-accent bg-accent text-bg"
                          : "border-border bg-bg text-text-secondary hover:border-accent hover:text-accent",
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
