import { Tag } from "@/ui";
import { dedupApi, type DedupConfidence } from "@/lib/api/dedup";
import {
  booleanSearchParam,
  firstSearchParam,
  flattenSearchParams,
  type SearchParamValue,
} from "@/lib/search-params";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { FilterToggles } from "../_components/FilterToggles";
import { ConfidenceFilter } from "./_components/ConfidenceFilter";
import { GroupCard } from "./_components/GroupCard";
import { MetricsPanel } from "./_components/MetricsPanel";

export const dynamic = "force-dynamic";

function asConfidence(v: SearchParamValue): DedupConfidence | "all" {
  const s = firstSearchParam(v);
  if (s === "gold" || s === "confirmed") return s;
  return "all";
}

export default async function UniqueVacanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const crossSource = booleanSearchParam(sp.crossSource);
  const confidence = asConfidence(sp.confidence);

  const data = await dedupApi.list({
    crossSource: crossSource || undefined,
    confidence: confidence !== "all" ? confidence : undefined,
    pageSize: 100,
  });

  const flatSearchParams = flattenSearchParams(sp);

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="унікальні вакансії (gold)" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10 md:px-20">
        <section className="flex flex-col gap-3">
          <Tag>&gt; дедуплікація</Tag>
          <h2 className="font-display text-lg font-bold text-text-primary md:text-xl">
            крос-джерельні дублікати
          </h2>
          <p className="font-mono text-xs text-text-muted">
            одна позиція, опублікована більш ніж на одному джерелі · {data.pagination.total} груп
          </p>
        </section>

        <MetricsPanel metrics={data.metrics} />

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <FilterToggles
              basePath="/unique-vacancies"
              searchParams={flatSearchParams}
              toggles={[
                {
                  key: "crossSource",
                  offLabel: "усі групи",
                  onLabel: "лише крос-джерельні",
                  active: crossSource,
                },
              ]}
            />
            <ConfidenceFilter
              basePath="/unique-vacancies"
              searchParams={flatSearchParams}
              active={confidence}
            />
          </div>

          {data.items.length === 0 ? (
            <div className="border border-border bg-bg-card p-8 font-mono text-xs text-text-muted">
              за обраними фільтрами груп не знайдено.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {data.items.map((g) => (
                <GroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
