import type { ReactNode } from "react";

import type { ListVacanciesResponse, NodeRef } from "@/lib/api/vacancies";
import { cn } from "@/lib/utils";
import { Pagination } from "@/ui/navigation/Pagination";
import { VacancyMatchCard } from "@/entities/vacancy/VacancyMatchCard";

type Props = {
  result: ListVacanciesResponse;
  offset: number;
  // Client-driven pagination: the shell pushes ?offset shallowly and the query
  // refetches — no RSC navigation, so this is a callback, not a link.
  onNavigate: (offset: number) => void;
  // From the results query; dims the (kept-visible) previous page while the
  // next one loads.
  isFetching?: boolean;
  // The scored viewer's resolved skills (`/feed` response) for the diff counts.
  viewerSkills?: NodeRef[] | null;
  // View controls (freshness / sort / off-stack) shown inline in the header row.
  // The result count is NOT here: the pager below already prints
  // "showing 1–20 of N", and two counts in one column read as two numbers.
  controls?: ReactNode;
};

export function VacancyList({
  result,
  offset,
  onNavigate,
  isFetching,
  viewerSkills = null,
  controls,
}: Props) {
  return (
    <section
      id="list"
      className={cn(
        "flex w-full min-w-0 flex-col gap-6 transition-opacity",
        isFetching && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="font-display text-lg font-semibold text-text-primary md:text-xl">jobs</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{controls}</div>
      </div>

      {result.items.length === 0 ? (
        <div className="border border-border bg-bg-card p-8 text-center font-mono text-sm text-text-secondary">
          {result.total === 0 ? "Nothing found — loosen a filter" : "Empty page"}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {result.items.map((v) => (
            <VacancyMatchCard key={v.id} vacancy={v} viewerSkills={viewerSkills ?? []} />
          ))}
        </div>
      )}

      <Pagination
        total={result.total}
        limit={result.pageSize}
        offset={offset}
        onNavigate={onNavigate}
      />
    </section>
  );
}
