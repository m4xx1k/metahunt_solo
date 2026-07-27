import type { ListVacanciesResponse } from "@/lib/api/vacancies";
import { cn } from "@/lib/utils";
import { Pagination } from "@/ui/navigation/Pagination";
import { VacancyCard } from "@/entities/vacancy/VacancyCard";

type Props = {
  result: ListVacanciesResponse;
  offset: number;
  // Client-driven pagination: the shell pushes ?offset shallowly and the query
  // refetches — no RSC navigation, so this is a callback, not a link.
  onNavigate: (offset: number) => void;
  // From the results query; dims the (kept-visible) previous page while the
  // next one loads.
  isFetching?: boolean;
};

export function VacancyList({ result, offset, onNavigate, isFetching }: Props) {
  return (
    <section
      id="list"
      className={cn(
        "flex w-full min-w-0 flex-col gap-6 transition-opacity",
        isFetching && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-text-primary md:text-xl">
          jobs
        </h2>
        <span className="font-mono text-xs text-text-muted">
          <span className="text-text-secondary">{result.total}</span> found ·
          page {result.page}
        </span>
      </div>

      {result.items.length === 0 ? (
        <div className="border border-border bg-bg-card p-8 text-center font-mono text-sm text-text-secondary">
          {result.total === 0
            ? "Nothing found with the current filters — try removing some."
            : "This page is empty — go back to the previous one."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {result.items.map((v) => (
            <VacancyCard key={v.id} vacancy={v} />
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
