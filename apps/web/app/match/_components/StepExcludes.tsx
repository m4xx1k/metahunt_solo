"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { facetsApi } from "@/lib/api/facets";
import { chipClass } from "@/ui/inputs/pill";

import type { SkillPick } from "./flow";

const SEARCH_MAX = 6;

export function StepExcludes({
  excludes,
  onChange,
  ownSkills,
}: {
  excludes: SkillPick[];
  onChange: (excludes: SkillPick[]) => void;
  ownSkills: SkillPick[];
}) {
  const [query, setQuery] = useState("");
  const { data: catalog } = useQuery({
    queryKey: ["skills-catalog"],
    queryFn: () => facetsApi.skills(),
    staleTime: 60_000,
  });

  const excludedIds = new Set(excludes.map((s) => s.id));
  const excludedNames = new Set(excludes.map((s) => s.name.toLowerCase()));
  const ownCandidates = ownSkills.filter(
    (s) => !excludedIds.has(s.id) && !excludedNames.has(s.name.toLowerCase()),
  );

  const q = query.trim().toLowerCase();
  const results =
    q.length === 0
      ? []
      : (catalog?.skills ?? [])
          .filter(
            (s) =>
              !excludedIds.has(s.id) &&
              !excludedNames.has(s.name.toLowerCase()) &&
              s.name.toLowerCase().includes(q),
          )
          .slice(0, SEARCH_MAX);

  const add = (s: SkillPick) => {
    onChange([...excludes, s]);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        Сховаємо вакансії, де ці навички обовʼязкові.
      </p>

      {excludes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            не пропонувати:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {excludes.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-stretch border border-danger/50 bg-danger/5"
              >
                <span className="px-1.5 py-[1px] font-mono text-xs text-text-secondary">
                  {s.name.toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(excludes.filter((p) => p.id !== s.id))}
                  aria-label={`Повернути ${s.name}`}
                  className="border-l border-danger/50 px-1 font-mono text-xs text-text-muted transition-colors hover:text-text-secondary"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {ownCandidates.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            зі своїх навичок (маю, але не хочу):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ownCandidates.slice(0, 16).map((s) => (
              <button key={s.id} type="button" onClick={() => add(s)} className={chipClass(false)}>
                {s.name.toLowerCase()} ✕
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="або знайди в списку: react, php…"
          className="w-full border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {q.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto border border-border bg-bg-card shadow-brut-sm">
            {results.length === 0 ? (
              <li className="px-3 py-1.5 font-mono text-xs text-text-muted">нічого не знайшли</li>
            ) : (
              results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => add({ id: r.id, name: r.name })}
                    className="block w-full px-3 py-1.5 text-left font-mono text-xs text-text-secondary transition-colors hover:bg-bg hover:text-accent"
                  >
                    {r.name.toLowerCase()}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
