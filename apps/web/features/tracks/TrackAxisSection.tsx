"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ChangeEvent, useCallback, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/ui/layout/CollapsibleSection";
import { chipClass } from "@/ui/inputs/pill";

// One unified facet panel for either axis of an active track (roles or
// skills). Three zones, top to bottom:
//   1. selected chips — the track's preset nodes (on by default) plus any
//      the user added; clicking toggles a node off/on.
//   2. suggestions — contextual nodes ranked for this track (skills only;
//      empty for roles), each a click-to-add chip.
//   3. a search box that adds ANY node from the full verified catalog.
//
// State lives in the URL (?roles / ?skills, comma-joined) so it survives
// reload/share. URL model: the param ABSENT means exactly the presets (clean
// URL on a fresh track pick); a PRESENT value — even empty (`?skills=`) — is
// the explicit set, which is what lets a preset be fully removed (drop Go to
// broaden backend-go to all backend). The page reads the same param: absent →
// the track's preset, present → the listed ids.

const SEP = ",";
const MAX_MATCHES = 8;
const MAX_SUGGEST = 8;

export type TrackAxis = { id: string; name: string; count?: number };

export function TrackAxisSection({
  title,
  urlKey,
  addLabel,
  presets,
  catalog,
  suggestions = [],
}: {
  /** Section header, e.g. "refine · roles" or "skills". */
  title: string;
  /** Query-string key this axis owns: "roles" | "skills". */
  urlKey: string;
  /** Search input placeholder, e.g. "add role…". */
  addLabel: string;
  /** The track's preset nodes for this axis (shown on by default). */
  presets: TrackAxis[];
  /** Full verified catalog — search-and-add + name resolution. */
  catalog: TrackAxis[];
  /** Contextual ranked nodes (skills only); omitted for roles. */
  suggestions?: TrackAxis[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const presetIds = presets.map((p) => p.id);
  const presetSet = new Set(presetIds);
  const raw = searchParams.get(urlKey);
  const selected = raw === null ? presetIds : raw.split(SEP).filter(Boolean);
  const selectedSet = new Set(selected);

  const nameOf = (id: string) =>
    presets.find((p) => p.id === id)?.name ??
    catalog.find((c) => c.id === id)?.name ??
    suggestions.find((s) => s.id === id)?.name ??
    id;

  // Chips = every preset (so a removed one can be turned back on) + any added
  // id not in the preset, in selection order.
  const addedIds = selected.filter((id) => !presetSet.has(id));
  const chips = [...presetIds, ...addedIds];
  const chipSet = new Set(chips);

  const visibleSuggest = suggestions
    .filter((s) => !chipSet.has(s.id))
    .slice(0, MAX_SUGGEST);

  const q = query.trim().toLowerCase();
  const matches = q
    ? catalog
        .filter((c) => !chipSet.has(c.id) && c.name.toLowerCase().includes(q))
        .slice(0, MAX_MATCHES)
    : [];

  const commit = (nextIds: string[]) => {
    const next = new URLSearchParams(searchParams.toString());
    const isPreset =
      nextIds.length === presetIds.length &&
      presetIds.every((id) => nextIds.includes(id));
    if (isPreset) next.delete(urlKey);
    else next.set(urlKey, nextIds.join(SEP)); // [] → "" (explicit empty)
    next.delete("offset"); // a new refine context resets pagination
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const toggle = (id: string) =>
    commit(
      selectedSet.has(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  const add = (id: string) => {
    setQuery("");
    if (!selectedSet.has(id)) commit([...selected, id]);
  };

  const handleQueryChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [],
  );

  const summary =
    selected.length === 0 ? "any" : `${selected.length} selected`;

  return (
    <CollapsibleSection title={title} summary={summary}>
      <div
        className={cn(
          "flex flex-col gap-3",
          isPending && "pointer-events-none opacity-50 transition-opacity",
        )}
        aria-busy={isPending || undefined}
      >
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((id) => {
              const active = selectedSet.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(id)}
                  className={chipClass(active)}
                >
                  {nameOf(id)}
                </button>
              );
            })}
          </div>
        ) : null}

        {visibleSuggest.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleSuggest.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={false}
                onClick={() => add(s.id)}
                className={chipClass(false)}
              >
                + {s.name}
              </button>
            ))}
          </div>
        ) : null}

        <input
          type="search"
          value={query}
          onChange={handleQueryChange}
          placeholder={addLabel}
          className="border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />

        {q.length > 0 ? (
          matches.length > 0 ? (
            <ul className="flex flex-col">
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => add(c.id)}
                    className="group grid w-full grid-cols-[1fr_auto] items-center gap-3 py-1 text-left"
                  >
                    <span className="truncate font-body text-sm text-text-primary group-hover:text-accent">
                      + {c.name}
                    </span>
                    {c.count != null ? (
                      <span className="font-mono text-2xs tabular-nums text-text-muted">
                        {c.count}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-2 font-mono text-xs text-text-muted">
              no matches
            </p>
          )
        ) : null}
      </div>
    </CollapsibleSection>
  );
}
