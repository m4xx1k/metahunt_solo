"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { useSaved, type SavedSub } from "@/lib/hooks/use-saved";

// Anonymous saved-state switcher (localStorage): recent uploaded CVs and warm
// subscriptions. Pick a CV to re-rank, pick a sub to replay its filters + CV.
// Renders nothing until there's something saved.
export function SavedSwitcher({
  onPickCv,
  onPickSub,
}: {
  onPickCv: (candidateId: string) => void;
  onPickSub: (sub: SavedSub) => void;
}) {
  const { cvs, subs, activeCv, removeCv, removeSub } = useSaved();
  const [open, setOpen] = useState(false);

  if (cvs.length === 0 && subs.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="border border-border bg-bg-card px-3 py-2 font-mono text-2xs uppercase tracking-wider text-text-secondary transition-colors hover:text-accent"
      >
        збережене · {cvs.length + subs.length}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute right-0 z-30 mt-1 max-h-[70vh] w-72 overflow-y-auto border border-border bg-bg-card shadow-brut-lg">
            {cvs.length > 0 ? (
              <section className="border-b border-border p-2">
                <p className="px-1 py-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
                  резюме
                </p>
                {cvs.map((cv) => (
                  <Row
                    key={cv.candidateId}
                    label={cv.label}
                    active={cv.candidateId === activeCv}
                    onPick={() => {
                      onPickCv(cv.candidateId);
                      setOpen(false);
                    }}
                    onRemove={() => removeCv(cv.candidateId)}
                  />
                ))}
              </section>
            ) : null}

            {subs.length > 0 ? (
              <section className="p-2">
                <p className="px-1 py-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
                  підписки
                </p>
                {subs.map((sub) => (
                  <Row
                    key={sub.id}
                    label={sub.label}
                    onPick={() => {
                      onPickSub(sub);
                      setOpen(false);
                    }}
                    onRemove={() => removeSub(sub.id)}
                  />
                ))}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  active = false,
  onPick,
  onRemove,
}: {
  label: string;
  active?: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1">
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "min-w-0 flex-1 truncate text-left font-mono text-xs transition-colors",
          active ? "text-accent" : "text-text-primary hover:text-accent",
        )}
      >
        {active ? "● " : ""}
        {label}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="прибрати"
        className="shrink-0 px-1 font-mono text-text-muted transition-colors hover:text-danger"
      >
        {"×"}
      </button>
    </div>
  );
}
