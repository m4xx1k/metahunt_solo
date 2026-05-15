import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { vacanciesApi } from "@/lib/api/vacancies";
import { Snapshot } from "./_components/market-snapshot/Snapshot";
import { MarketFilters } from "./_components/market-snapshot/MarketFilters";
import { VacancyList } from "./_components/vacancy-list/VacancyList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const snapshotNav: NavItem[] = [
  { label: "вакансії", href: "#list" },
  { label: "моніторинг", href: "/dashboard" },
  { label: "про проєкт", href: "/welcome" },
];

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asCsv(v: string | string[] | undefined): string[] {
  const s = asString(v);
  return s ? s.split(",").filter(Boolean) : [];
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const offset = asNonNegativeInt(sp.offset, 0);
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const roleId = asString(sp.role);
  const skillIds = asCsv(sp.skills);
  const sourceCode = asString(sp.source);

  // The sidebar drives source by code; the list query needs the UUID.
  // Aggregates is small + ISR-cached, so the sequential await is cheap.
  const aggregates = await aggregatesApi.get();
  const sourceId =
    sourceCode != null
      ? (aggregates.sources.find((s) => s.code === sourceCode)?.id ?? null)
      : null;

  const list = await vacanciesApi.list({
    page,
    pageSize: PAGE_SIZE,
    roleId: roleId ?? undefined,
    skillIds: skillIds.length > 0 ? skillIds : undefined,
    sourceId: sourceId ?? undefined,
  });

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  return (
    <>
      <Header links={snapshotNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        <Snapshot aggregates={aggregates} />
        <div className="mx-auto w-full max-w-[1200px] px-6 pb-20 lg:px-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
            <MarketFilters aggregates={aggregates} />
            <VacancyList
              result={list}
              offset={offset}
              flatSearchParams={flatSearchParams}
            />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
