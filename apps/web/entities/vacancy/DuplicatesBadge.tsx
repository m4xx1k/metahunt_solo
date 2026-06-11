"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import {
  vacanciesApi,
  type DedupGroupMember,
  type DedupReason,
  type FeedDuplicateGroup,
} from "@/lib/api/vacancies";

type Props = {
  uniqueVacancyId: string;
  /** Total postings in the group (= vacancyCount). */
  count: number;
  /** Distinct sources across the group. */
  sourceCount: number;
};

// Ukrainian plural: [one, few (2-4), many (5+)].
function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

export function DuplicatesBadge({ uniqueVacancyId, count, sourceCount }: Props) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<FeedDuplicateGroup | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Fetch once, lazily, the first time the drawer opens.
  useEffect(() => {
    if (!open || group || error) return;
    let alive = true;
    vacanciesApi
      .group(uniqueVacancyId)
      .then((g) => alive && setGroup(g))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [open, group, error, uniqueVacancyId]);

  const sourceSuffix =
    sourceCount > 1
      ? ` · ${sourceCount} ${plural(sourceCount, ["джерело", "джерела", "джерел"])}`
      : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex w-fit items-center gap-1.5 border border-accent-secondary px-2 py-[2px] font-mono text-xs text-accent-secondary transition-colors hover:bg-accent-secondary/10"
        title="Показати об'єднані дублікати"
      >
        <span aria-hidden>⧉</span>
        <span>
          {count} {plural(count, ["копія", "копії", "копій"])}
          {sourceSuffix}
        </span>
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex animate-overlay-in justify-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="об'єднані дублікати вакансії"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-[520px] flex-col gap-5 overflow-y-auto border-l border-accent-secondary bg-bg-card p-6 shadow-[-8px_0_0_0_#000]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  семантичний дедуп
                </span>
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-2xl font-bold text-text-primary">
                    Об&apos;єднано {count}{" "}
                    {plural(count, ["вакансію", "вакансії", "вакансій"])}
                  </h2>
                  <span className="border border-accent px-2 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
                    gold
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 border border-border px-3 py-1 font-mono text-xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
              >
                закрити [esc]
              </button>
            </header>

            {error ? (
              <p className="border border-danger bg-bg p-4 font-mono text-sm text-danger">
                не вдалося завантажити групу
              </p>
            ) : !group ? (
              <p className="font-mono text-sm text-text-muted">завантаження…</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {group.members.map((m) => (
                  <MemberRow key={m.vacancyId} member={m} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── drawer internals ───────────────────────────────────────────────────

function MemberRow({ member: m }: { member: DedupGroupMember }) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 border bg-bg-elev p-4",
        m.isCanonical ? "border-border-strong" : "border-border",
      )}
    >
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] uppercase tracking-wider">
        <span className="font-bold text-accent">{m.source.displayName}</span>
        {m.isCanonical ? (
          <span className="border border-border-strong px-2 py-[1px] text-[10px] text-text-secondary">
            основна
          </span>
        ) : (
          <span className="text-text-muted">{formatRelative(m.publishedAt)}</span>
        )}
      </div>

      <p className="font-body text-sm leading-snug text-text-primary">{m.title}</p>

      {m.externalUrl ? (
        <a
          href={m.externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="w-fit font-mono text-xs text-accent hover:underline"
        >
          ↗ відкрити оригінал
        </a>
      ) : null}

      {m.dedupReason ? <WhyMerged reason={m.dedupReason} /> : null}
    </li>
  );
}

function WhyMerged({ reason: r }: { reason: DedupReason }) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const simColor =
    r.similarity >= 0.95
      ? "text-success"
      : r.similarity >= 0.92
        ? "text-accent"
        : "text-text-secondary";
  const barColor =
    r.similarity >= 0.95
      ? "bg-success"
      : r.similarity >= 0.92
        ? "bg-accent"
        : "bg-text-muted";

  const pf = r.prefilterMatches;
  const mark = (v: boolean | null) => (v === null ? "—" : v ? "✓" : "✗");

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        чому об&apos;єднано
      </span>

      {/* similarity bar */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          схожість
        </span>
        <div className="h-1.5 flex-1 bg-bg">
          <div
            className={cn("h-full", barColor)}
            style={{ width: `${Math.round(r.similarity * 100)}%` }}
          />
        </div>
        <span className={cn("font-mono text-xs font-bold", simColor)}>
          {pct(r.similarity)}
        </span>
      </div>

      {/* corroboration chips */}
      <div className="flex flex-wrap gap-2">
        {r.corroboration.companyMatch ? (
          <Chip icon="🏢" label="та сама компанія" strong />
        ) : null}
        {r.corroboration.skillJaccard > 0 ? (
          <Chip
            icon="🧩"
            label={`скіли ${pct(r.corroboration.skillJaccard)}`}
            strong={r.corroboration.skillJaccard >= 0.5}
          />
        ) : null}
        {r.corroboration.titleJaccard > 0 ? (
          <Chip
            icon="📝"
            label={`назва ${pct(r.corroboration.titleJaccard)}`}
            strong={r.corroboration.titleJaccard >= 0.5}
          />
        ) : null}
      </div>

      {/* prefilter facts — quiet */}
      <p className="font-mono text-[10px] text-text-muted">
        роль {mark(pf.role)} · рівень {mark(pf.seniority)} · формат{" "}
        {mark(pf.workFormat)} · вікно {pf.dateWindowDays}д
      </p>
    </div>
  );
}

function Chip({
  icon,
  label,
  strong,
}: {
  icon: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-[2px] font-mono text-[11px]",
        strong
          ? "border-success text-success"
          : "border-border text-text-secondary",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}
