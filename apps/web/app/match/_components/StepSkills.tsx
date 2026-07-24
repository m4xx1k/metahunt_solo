"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { CvSkillManager, type CvSkillManagerCopy } from "@/features/cv-match/CvSkillManager";
import { facetsApi } from "@/lib/api/facets";

import { SKILLS_HINT_MIN, type SkillPick } from "./flow";

const UA_COPY: CvSkillManagerCopy = {
  title: "твої навички",
  loading: "завантажуємо навички…",
  empty: "поки порожньо — додай навички через пошук",
  searchPlaceholder: "додати навичку…",
  noMatches: "нічого не знайшли",
  suggestionsTitle: "мабуть, ти також знаєш:",
};

// Skills review. CV path = the real skill manager (remove / search-add /
// confirm NPMI suggestions) over the stored candidate; manual path = the same
// interaction over local state, committed to the feed URL at the end.
export function StepSkills({
  candidateId,
  unmatched,
  skillCount,
  manualSkills,
  onManualSkillsChange,
}: {
  /** Set = CV path (server-backed skill set); null = manual path (local state). */
  candidateId: string | null;
  /** CV terms that didn't resolve onto the taxonomy — shown, not hidden. */
  unmatched: string[];
  skillCount: number;
  manualSkills: SkillPick[];
  onManualSkillsChange: (skills: SkillPick[]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        Це твій стек? Поправ — від нього залежить добірка.
      </p>

      {candidateId ? (
        <CvSkillManager
          candidateId={candidateId}
          copy={UA_COPY}
          className="border-0 bg-transparent p-0 shadow-none"
        />
      ) : (
        <ManualSkillPicker skills={manualSkills} onChange={onManualSkillsChange} />
      )}

      {candidateId && skillCount === 0 ? (
        <p className="border border-accent/40 bg-accent/5 px-4 py-2 font-mono text-xs text-text-secondary">
          Не змогли прочитати навички з CV — додай їх вручну через пошук вище.
        </p>
      ) : skillCount < SKILLS_HINT_MIN ? (
        <p className="font-mono text-xs text-text-muted">
          Додай хоча б {SKILLS_HINT_MIN} — точніше порадимо ролі й вакансії.
        </p>
      ) : null}

      {unmatched.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            цього ми ще не знаємо
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unmatched.slice(0, 12).map((s) => (
              <span
                key={s}
                className="border border-dashed border-border px-1.5 py-[1px] font-mono text-xs text-text-muted"
              >
                {s.toLowerCase()}
              </span>
            ))}
            {unmatched.length > 12 ? (
              <span className="px-1 font-mono text-xs text-text-muted">
                +{unmatched.length - 12}
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-text-muted">
            цих термінів ще немає в нашій таксономії — вони не впливають на добірку
          </p>
        </div>
      ) : null}
    </div>
  );
}

const SEARCH_MAX = 8;

// Local-state twin of the CV skill manager's search-add: chips + catalog
// search. Ids are facet slugs, so the final CTA can turn them straight into
// the cold feed's `?skills=` filter.
function ManualSkillPicker({
  skills,
  onChange,
}: {
  skills: SkillPick[];
  onChange: (skills: SkillPick[]) => void;
}) {
  const [query, setQuery] = useState("");
  const { data: catalog } = useQuery({
    queryKey: ["skills-catalog"],
    queryFn: () => facetsApi.skills(),
    staleTime: 60_000,
  });

  const pickedIds = new Set(skills.map((s) => s.id));
  const q = query.trim().toLowerCase();
  const results =
    q.length === 0
      ? []
      : (catalog?.skills ?? [])
          .filter((s) => !pickedIds.has(s.id) && s.name.toLowerCase().includes(q))
          .slice(0, SEARCH_MAX);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {skills.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">
            поки порожньо — знайди свої навички нижче
          </p>
        ) : (
          skills.map((s) => (
            <span key={s.id} className="inline-flex items-stretch border border-border">
              <span className="px-1.5 py-[1px] font-mono text-xs text-text-secondary">
                {s.name.toLowerCase()}
              </span>
              <button
                type="button"
                onClick={() => onChange(skills.filter((p) => p.id !== s.id))}
                aria-label={`Прибрати ${s.name}`}
                className="border-l border-border px-1 font-mono text-xs text-text-muted transition-colors hover:text-text-secondary"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="python, react, docker…"
          autoFocus
          className="w-full border border-border bg-bg px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {q.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-border bg-bg-card shadow-brut-sm">
            {results.length === 0 ? (
              <li className="px-3 py-1.5 font-mono text-xs text-text-muted">нічого не знайшли</li>
            ) : (
              results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...skills, { id: r.id, name: r.name }]);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-xs text-text-secondary transition-colors hover:bg-bg hover:text-accent"
                  >
                    <span>{r.name.toLowerCase()}</span>
                    <span className="shrink-0 text-text-muted">{r.count} вакансій</span>
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
