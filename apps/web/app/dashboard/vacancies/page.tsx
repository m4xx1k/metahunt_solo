import type { Metadata } from "next";

import { vacanciesApi } from "@/lib/api/vacancies";
import {
  booleanSearchParam,
  firstSearchParam,
  flattenSearchParams,
  nonNegativeIntegerSearchParam,
} from "@/lib/search-params";
import { formatCount } from "@/lib/format";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { FilterToggles } from "@/ui/inputs/FilterToggles";
import { UrlSearch } from "@/ui/inputs/UrlSearch";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Pagination } from "@/ui/navigation/Pagination";
import { VacancyInspectCard } from "./_components/VacancyInspectCard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vacancies" };

const PAGE_SIZE = 10;

// Silver tier: one row per source posting, after LLM structuring and before
// dedupe. Gold (deduplicated positions) lives on /dashboard/dedupe.
export default async function VacanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = nonNegativeIntegerSearchParam(sp.offset);
  const q = firstSearchParam(sp.q);
  const includeRoleless = booleanSearchParam(sp.includeRoleless);
  const includeAllSkills = booleanSearchParam(sp.includeAllSkills);

  const result = await vacanciesApi.list({
    page: Math.floor(offset / PAGE_SIZE) + 1,
    pageSize: PAGE_SIZE,
    q,
    includeRoleless,
    includeAllSkills,
  });

  const flatSearchParams = flattenSearchParams(sp);

  return (
    <>
      <PageHeader
        title="Vacancies"
        hint={`silver tier · ${formatCount(result.total)} postings`}
        actions={<UrlSearch placeholder="title, company…" />}
      />

      <PageBody>
        <FilterToggles
          basePath="/dashboard/vacancies"
          searchParams={flatSearchParams}
          toggles={[
            {
              key: "includeRoleless",
              offLabel: "verified role only",
              onLabel: "include roleless",
              active: includeRoleless,
            },
            {
              key: "includeAllSkills",
              offLabel: "verified skills only",
              onLabel: "all skills",
              active: includeAllSkills,
            },
          ]}
        />

        {result.items.length === 0 ? (
          <EmptyState
            title="nothing matches these filters"
            hint="drop a filter or clear the search."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {result.items.map((vacancy) => (
              <VacancyInspectCard key={vacancy.id} vacancy={vacancy} />
            ))}
          </div>
        )}

        <Pagination
          total={result.total}
          limit={result.pageSize}
          offset={offset}
          basePath="/dashboard/vacancies"
          searchParams={flatSearchParams}
        />
      </PageBody>
    </>
  );
}
