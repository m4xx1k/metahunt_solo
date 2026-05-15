"use client";

import { useMemo, useState } from "react";
import { Section } from "./Section";
import { SelectRow } from "./SelectRow";
import type { SkillStat } from "./types";

const TOP_N = 8;

export function SkillsSection({
  skills,
  selectedIds,
  onToggle,
}: {
  skills: SkillStat[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const q = query.trim().toLowerCase();

  const { selected, rest } = useMemo(() => {
    const selSet = new Set(selectedIds);
    const sel: SkillStat[] = [];
    const unsel: SkillStat[] = [];
    for (const s of skills) (selSet.has(s.id) ? sel : unsel).push(s);
    const byCount = (a: SkillStat, b: SkillStat) => b.count - a.count;
    return { selected: sel.sort(byCount), rest: unsel.sort(byCount) };
  }, [skills, selectedIds]);

  const filteredRest = useMemo(() => {
    if (q.length === 0) return rest;
    return rest.filter((s) => s.label.toLowerCase().includes(q));
  }, [rest, q]);

  const visibleRest =
    q.length > 0 || showAll ? filteredRest : filteredRest.slice(0, TOP_N);
  const hiddenCount = filteredRest.length - visibleRest.length;

  const summary =
    selectedIds.length > 0 ? `${selectedIds.length} selected` : "any";
  const showNoMatches = q.length > 0 && filteredRest.length === 0;
  const showDivider =
    selected.length > 0 && (visibleRest.length > 0 || showNoMatches);

  return (
    <Section title="skills" summary={summary}>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search skill…"
          className="border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />

        <ul className="flex flex-col">
          {selected.map((s) => (
            <SelectRow
              key={s.id}
              label={s.label}
              count={s.count}
              active
              marker="check"
              onClick={() => onToggle(s.id)}
            />
          ))}
          {showDivider ? (
            <li aria-hidden className="my-1 border-t border-border/60" />
          ) : null}
          {visibleRest.map((s) => (
            <SelectRow
              key={s.id}
              label={s.label}
              count={s.count}
              active={false}
              marker="check"
              onClick={() => onToggle(s.id)}
            />
          ))}
          {showNoMatches ? (
            <li className="px-1 py-3 font-mono text-xs text-text-muted">
              no matches
            </li>
          ) : null}
        </ul>

        {q.length === 0 && hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="self-start font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-accent"
          >
            [+ {hiddenCount} more]
          </button>
        ) : null}
        {q.length === 0 && showAll ? (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="self-start font-mono text-[11px] uppercase tracking-wider text-text-secondary hover:text-accent"
          >
            [− collapse]
          </button>
        ) : null}
      </div>
    </Section>
  );
}
