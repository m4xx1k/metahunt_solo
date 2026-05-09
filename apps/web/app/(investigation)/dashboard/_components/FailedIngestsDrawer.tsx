"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { IngestListItem } from "@/lib/api/monitoring";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";

type Props = {
  count: number;
  failedIngests: IngestListItem[];
  trigger: React.ReactNode;
};

export function FailedIngestsDrawer({ count, failedIngests, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const interactive = count > 0 && failedIngests.length > 0;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={interactive ? () => setOpen(true) : undefined}
        disabled={!interactive}
        className={cn(
          "block w-full text-left",
          !interactive && "cursor-default",
        )}
        aria-haspopup={interactive ? "dialog" : undefined}
        aria-expanded={open}
      >
        {trigger}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="failed ingests · last 24h"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-[480px] flex-col gap-5 overflow-y-auto border-l border-danger bg-bg-card p-6 shadow-[-8px_0_0_0_#000]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  failed · last 24h
                </span>
                <h2 className="font-display text-2xl font-bold text-danger">
                  {count} ingest{count === 1 ? "" : "s"} failed
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-border px-3 py-1 font-mono text-xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
              >
                close [esc]
              </button>
            </header>

            <ul className="flex flex-col gap-3">
              {failedIngests.map((it) => {
                const source = it.sourceCode ?? it.sourceDisplayName ?? "src";
                return (
                  <li
                    key={it.id}
                    className="flex flex-col gap-2 border border-border bg-bg-elev p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3 font-mono text-xs uppercase tracking-wider">
                      <span className="text-text-muted">{source}</span>
                      <span className="text-text-muted">
                        {formatRelative(it.startedAt)}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/ingests/${it.id}`}
                      className="font-mono text-sm text-accent hover:underline"
                    >
                      ingest #{it.id.slice(0, 8)}…
                    </Link>
                    {it.errorMessage ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-3 font-mono text-xs leading-relaxed text-danger">
                        {it.errorMessage}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
