import { Tag } from "@/components/ui-kit";
import { vacanciesApi } from "@/lib/api/vacancies";
import { InvestigationHeader } from "../_components/InvestigationHeader";
import { Pagination } from "../_components/Pagination";
import { FilterToggles } from "./_components/FilterToggles";
import { VacancyCard } from "./_components/VacancyCard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asNonNegativeInt(
  v: string | string[] | undefined,
  fallback: number,
): number {
  const s = asString(v);
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function asBool(v: string | string[] | undefined): boolean {
  return asString(v) === "true";
}

export default async function VacanciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = asNonNegativeInt(sp.offset, 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const q = asString(sp.q);
  const includeRoleless = asBool(sp.includeRoleless);
  const includeAllSkills = asBool(sp.includeAllSkills);

  const result = await vacanciesApi.list({
    page,
    pageSize: PAGE_SIZE,
    q,
    includeRoleless,
    includeAllSkills,
  });

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="silver vacancies" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Tag>&gt; silver feed</Tag>
            <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
              extracted vacancies
            </h2>
            <p className="font-mono text-xs text-text-muted">
              {result.total} total · page {result.page}
            </p>
          </div>

          <FilterToggles
            basePath="/vacancies"
            searchParams={flatSearchParams}
            toggles={[
              {
                key: "includeRoleless",
                offLabel: "verified role only",
                onLabel: "incl. roleless",
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
            <p className="font-mono text-sm text-text-muted">
              no vacancies match the filters
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {result.items.map((v) => (
                <VacancyCard key={v.id} vacancy={v} />
              ))}
            </div>
          )}

          <Pagination
            total={result.total}
            limit={result.pageSize}
            offset={offset}
            basePath="/vacancies"
            searchParams={flatSearchParams}
          />
        </section>
      </div>
    </main>
  );
}
