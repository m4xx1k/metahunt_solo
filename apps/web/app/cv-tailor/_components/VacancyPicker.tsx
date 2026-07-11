"use client";

import { useEffect, useState } from "react";

import { cvApi } from "@/lib/api/cv";
import type { RankedVacancy } from "@/lib/api/ranking";

// Real parsed vacancies for this CV (reverse-ATS matches). Picking one hands its
// id to the tailor endpoint, which pulls the vacancy's parsed skills as the
// target — no pasting. Remount via a `key={candidateId}` in the parent so it
// re-fetches cleanly when the CV changes.
export function VacancyPicker({
  candidateId,
  selectedId,
  onSelect,
}: {
  candidateId: string;
  selectedId: string | null;
  onSelect: (v: { id: string; label: string }) => void;
}) {
  const [items, setItems] = useState<RankedVacancy[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cvApi
      .matches(candidateId, { pageSize: 40 })
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "could not load vacancies");
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (err) return <p className="font-mono text-xs text-danger">{err}</p>;
  if (!items) return <p className="font-mono text-2xs text-text-muted">loading vacancies…</p>;
  if (items.length === 0)
    return (
      <p className="font-mono text-2xs text-text-muted">
        no ranked vacancies for this CV yet — try the &quot;paste a description&quot; tab.
      </p>
    );

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? items.filter((it) =>
        `${it.vacancy.title} ${it.vacancy.company?.name ?? ""}`.toLowerCase().includes(needle),
      )
    : items;

  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="filter by title or company…"
        className="w-full border border-border bg-bg px-3 py-2 font-body text-xs text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none"
      />
      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.map((it) => {
          const label = it.vacancy.company?.name
            ? `${it.vacancy.title} · ${it.vacancy.company.name}`
            : it.vacancy.title;
          const active = it.vacancy.id === selectedId;
          const tone =
            it.fit.tier === "STRONG"
              ? "text-success"
              : it.fit.tier === "GOOD"
                ? "text-accent"
                : "text-text-muted";
          return (
            <button
              key={it.vacancy.id}
              type="button"
              onClick={() => onSelect({ id: it.vacancy.id, label })}
              className={`flex items-center justify-between gap-3 border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-accent bg-accent-subtle-bg"
                  : "border-border bg-bg-elev hover:border-border-strong"
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-body text-xs font-semibold text-text-primary">
                  {it.vacancy.title}
                </span>
                <span className="font-mono text-2xs text-text-muted">
                  {it.vacancy.company?.name ?? "—"}
                </span>
              </span>
              <span className={`shrink-0 font-mono text-2xs uppercase tracking-wider ${tone}`}>
                {it.fit.tier} · {it.fit.matchedRequired}/{it.fit.requiredTotal}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
