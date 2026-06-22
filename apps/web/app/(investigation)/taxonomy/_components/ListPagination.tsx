"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useUrlState } from "../_hooks/use-url-state";

type Props = {
  page: number;
  pageSize: number;
  total: number;
};

export function ListPagination({ page, pageSize, total }: Props) {
  const { update } = useUrlState();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const handlePrev = useCallback(() => {
    const next = page - 1;
    update({ page: next > 1 ? String(next) : null, selected: null });
  }, [page, update]);

  const handleNext = useCallback(() => {
    update({ page: String(page + 1), selected: null });
  }, [page, update]);

  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page < lastPage;

  const linkBase =
    "inline-flex items-center px-3 py-2 font-mono text-xs uppercase tracking-wider border border-border bg-bg-card sm:py-1";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-xs text-text-muted sm:text-2xs">
        показано {from}–{to} з {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!hasPrev}
          onClick={handlePrev}
          className={cn(
            linkBase,
            hasPrev ? "hover:bg-bg-elev hover:text-accent" : "opacity-40",
          )}
        >
          ← попер.
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={handleNext}
          className={cn(
            linkBase,
            hasNext ? "hover:bg-bg-elev hover:text-accent" : "opacity-40",
          )}
        >
          наст. →
        </button>
      </div>
    </div>
  );
}
