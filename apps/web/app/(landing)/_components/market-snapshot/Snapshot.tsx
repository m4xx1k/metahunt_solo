import type { VacancyAggregates } from "@/lib/api/aggregates";
import { TotalCounter } from "./TotalCounter";

// Intro / hero for the landing. The interactive filter sidebar lives in
// MarketFilters and is rendered next to the vacancy list (page.tsx), not
// here. The old stat widgets (TopSkills / TopRoles / SeniorityBars /
// FormatDonut / SourceTabs) are intentionally kept in this folder but
// NOT rendered — a slimmed-down analytics block is planned, so they're
// hidden, not deleted.

type Props = {
  aggregates: VacancyAggregates;
};

export function Snapshot({ aggregates: a }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-16 pb-10 md:px-12">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:items-stretch">
        <div className="flex flex-col justify-center gap-5">
          <h1 className="font-display text-4xl font-bold leading-tight text-text-primary md:text-5xl">
            Метахант
          </h1>
          <p className="max-w-[520px] font-body text-base leading-[1.55] text-text-secondary md:text-lg">
            агрегує IT-вакансії з DOU та Джині, нормалізує роль / стек / формат
            і викладає одним списком.
          </p>
        </div>
        <TotalCounter
          total={a.total}
          lastSyncAt={a.lastSyncAt}
          sources={a.sources}
        />
      </div>
    </section>
  );
}
