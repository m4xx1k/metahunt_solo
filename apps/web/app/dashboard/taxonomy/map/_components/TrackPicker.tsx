"use client";

import { useMemo, useState } from "react";

import type { TrackDto } from "@/lib/api/tracks";
import { cn } from "@/lib/utils";
import { useUrlState } from "../../_hooks/use-url-state";

type Props = { tracks: TrackDto[]; selected: string };

const PILL =
  "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors sm:px-2 sm:py-1";
const ACTIVE = "border-accent text-accent";
const IDLE = "border-border text-text-muted hover:text-text-secondary";

export function TrackPicker({ tracks, selected }: Props) {
  const { update } = useUrlState();

  const disciplines = useMemo(
    () => tracks.filter((t) => t.parentSlug === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [tracks],
  );

  const childrenBy = useMemo(() => {
    const map = new Map<string, TrackDto[]>();
    for (const t of tracks) {
      if (t.parentSlug === null) continue;
      const arr = map.get(t.parentSlug) ?? [];
      arr.push(t);
      map.set(t.parentSlug, arr);
    }
    return map;
  }, [tracks]);

  const selectedParent = tracks.find((t) => t.slug === selected)?.parentSlug ?? selected;
  const [expanded, setExpanded] = useState<string | null>(selectedParent);

  const expandedKids = expanded ? (childrenBy.get(expanded) ?? []) : [];
  const expandedLabel = disciplines.find((d) => d.slug === expanded)?.label ?? "";

  const handleSelect = (slug: string) => () => update({ track: slug });
  const handleExpand = (slug: string) => () => setExpanded((cur) => (cur === slug ? null : slug));

  return (
    <div className="flex flex-col gap-2 border border-border bg-bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">track</span>
        {disciplines.map((d) => {
          const kids = childrenBy.get(d.slug) ?? [];
          return (
            <div key={d.slug} className="flex items-center">
              <button
                type="button"
                onClick={handleSelect(d.slug)}
                className={cn(PILL, selected === d.slug ? ACTIVE : IDLE)}
              >
                {d.label}
              </button>
              {kids.length > 0 ? (
                <button
                  type="button"
                  onClick={handleExpand(d.slug)}
                  aria-label={`${expanded === d.slug ? "collapse" : "expand"} ${d.label}`}
                  className={cn(
                    "border border-l-0 px-2 py-2 font-mono text-xs transition-colors sm:py-1",
                    expanded === d.slug ? ACTIVE : IDLE,
                  )}
                >
                  {expanded === d.slug ? "−" : "+"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {expandedKids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            {expandedLabel}
          </span>
          {expandedKids.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={handleSelect(c.slug)}
              className={cn(
                "border px-3 py-2 font-mono text-2xs uppercase tracking-wider transition-colors sm:px-2 sm:py-1",
                selected === c.slug ? ACTIVE : IDLE,
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
