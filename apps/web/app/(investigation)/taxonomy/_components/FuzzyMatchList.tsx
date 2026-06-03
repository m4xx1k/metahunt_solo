"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { taxonomyApi, type FuzzyMatch } from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

type Props = {
  sourceId: string;
  matches: FuzzyMatch[];
  skippedReason?: string;
  emptyLabel?: string;
};

export function FuzzyMatchList({
  sourceId,
  matches,
  skippedReason,
  emptyLabel = "схожих понять не знайдено",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMerge = (targetId: string, targetName: string) => async () => {
    if (
      !confirm(
        `Об'єднати поточне поняття у «${targetName}»? Усі посилання перенесуться, поточне видалиться, його назва стане псевдонімом цільового.`,
      )
    ) {
      return;
    }
    setBusyId(targetId);
    setError(null);
    try {
      await taxonomyApi.mergeInto(sourceId, targetId);
      // Source node is deleted by the merge; move the selection to the target
      // (where the data now lives) so the refresh doesn't re-fetch a dead id → 404.
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", targetId);
      router.push(`/taxonomy?${params.toString()}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDismissError = useCallback(() => setError(null), []);

  if (skippedReason) {
    return (
      <div className="flex flex-col gap-1 border border-border bg-bg-elev p-3 font-mono text-xs text-text-muted">
        <span className="font-bold text-text-secondary">
          пошук схожих пропущено
        </span>
        <span>назва занадто коротка для надійного зіставлення</span>
      </div>
    );
  }

  if (matches.length === 0) {
    return <p className="font-mono text-xs text-text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <button
          type="button"
          onClick={handleDismissError}
          className="border border-danger bg-bg p-2 text-left font-mono text-[11px] text-danger hover:bg-danger hover:text-bg"
        >
          {error} · приховати
        </button>
      ) : null}
      <ul className="flex flex-col divide-y divide-border border border-border bg-bg-elev">
        {matches.map((m) => {
          const disabled = busyId !== null;
          return (
            <li
              key={m.id}
              className="flex flex-col gap-2 px-3 py-2 font-mono text-xs sm:grid sm:grid-cols-[1fr_56px_auto] sm:items-center sm:gap-3"
            >
              <div className="flex items-center justify-between gap-3 sm:contents">
                <span
                  className="truncate text-text-primary"
                  title={m.canonicalName}
                >
                  {m.canonicalName}
                </span>
                <span className="shrink-0 text-text-muted sm:text-right">
                  {m.similarity.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={handleMerge(m.id, m.canonicalName)}
                className={cn(
                  "border px-3 py-2 text-[10px] uppercase tracking-wider transition-colors sm:px-2 sm:py-1",
                  disabled
                    ? "border-border text-text-muted"
                    : "border-accent text-accent hover:bg-accent hover:text-bg",
                )}
              >
                {busyId === m.id ? "…" : "об'єднати →"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
