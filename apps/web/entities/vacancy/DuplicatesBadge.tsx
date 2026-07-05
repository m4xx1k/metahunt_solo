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

// English plural: singular for 1, plural form otherwise.
function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
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
      ? ` · ${sourceCount} ${plural(sourceCount, "source", "sources")}`
      : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex w-fit items-center gap-1.5 border border-accent-secondary px-2 py-[2px] font-mono text-xs text-accent-secondary transition-colors hover:bg-accent-secondary/10"
        title="Show merged duplicates"
      >
        <span aria-hidden>⧉</span>
        <span>
          {count} {plural(count, "copy", "copies")}
          {sourceSuffix}
        </span>
        <span aria-hidden className="text-2xs">
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex animate-overlay-in justify-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="merged job duplicates"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-[520px] flex-col gap-5 overflow-y-auto border-l border-accent-secondary bg-bg-card p-6 shadow-brut-l"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  semantic dedup
                </span>
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  Merged {count} {plural(count, "job", "jobs")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 border border-border px-3 py-1 font-mono text-xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
              >
                close [esc]
              </button>
            </header>

            {error ? (
              <p className="border border-danger bg-bg p-4 font-mono text-sm text-danger">
                failed to load group
              </p>
            ) : !group ? (
              <p className="font-mono text-sm text-text-muted">loading…</p>
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
      <div className="flex items-baseline justify-between gap-3 font-mono text-2xs uppercase tracking-wider">
        <span className="font-bold text-accent">{m.source.displayName}</span>
        {m.isCanonical ? (
          <span className="border border-border-strong px-2 py-[1px] text-2xs text-text-secondary">
            canonical
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
          ↗ open original
        </a>
      ) : null}

      {m.dedupReason ? <WhyMerged reason={m.dedupReason} /> : null}
    </li>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const mark = (v: boolean | null) => (v === null ? "—" : v ? "✓" : "✗");

function WhyMerged({ reason: r }: { reason: DedupReason }) {
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

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        why merged
      </span>

      {/* similarity bar */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          similarity
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
          <Chip icon="🏢" label="same company" strong />
        ) : null}
        {r.corroboration.skillJaccard > 0 ? (
          <Chip
            icon="🧩"
            label={`skills ${pct(r.corroboration.skillJaccard)}`}
            strong={r.corroboration.skillJaccard >= 0.5}
          />
        ) : null}
        {r.corroboration.titleJaccard > 0 ? (
          <Chip
            icon="📝"
            label={`title ${pct(r.corroboration.titleJaccard)}`}
            strong={r.corroboration.titleJaccard >= 0.5}
          />
        ) : null}
      </div>

      {/* prefilter facts — quiet */}
      <p className="font-mono text-2xs text-text-muted">
        role {mark(pf.role)} · seniority {mark(pf.seniority)} · format{" "}
        {mark(pf.workFormat)} · window {pf.dateWindowDays}d
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
        "inline-flex items-center gap-1.5 border px-2 py-[2px] font-mono text-2xs",
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
