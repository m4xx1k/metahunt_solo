import type { ListVacanciesResponse } from "@/lib/api/vacancies";
import { Pagination } from "../../../(investigation)/_components/Pagination";
import { PublicVacancyCard } from "./PublicVacancyCard";

type Props = {
  result: ListVacanciesResponse;
  offset: number;
  flatSearchParams: Record<string, string | undefined>;
  // The active track lives in the route segment, not the query string, so the
  // page passes its route as the pagination base — otherwise paging drops it.
  basePath: string;
};

export function VacancyList({
  result,
  offset,
  flatSearchParams,
  basePath,
}: Props) {
  return (
    <section id="list" className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-semibold text-text-primary md:text-3xl">
          вакансії
        </h2>
        <span className="font-mono text-xs text-text-muted">
          <span className="text-text-secondary">{result.total}</span> знайдено ·
          стор. {result.page}
        </span>
      </div>

      {result.items.length === 0 ? (
        <p className="font-mono text-sm text-text-muted">
          {result.total === 0
            ? "Нічого не знайдено за поточними фільтрами — спробуй прибрати частину."
            : "Ця сторінка порожня — повернись на попередню."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {result.items.map((v) => (
            <PublicVacancyCard key={v.id} vacancy={v} />
          ))}
        </div>
      )}

      <Pagination
        total={result.total}
        limit={result.pageSize}
        offset={offset}
        basePath={basePath}
        searchParams={flatSearchParams}
      />
    </section>
  );
}
