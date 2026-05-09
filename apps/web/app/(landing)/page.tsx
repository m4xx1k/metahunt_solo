import { Header, type NavItem } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";
import { aggregatesApi } from "@/lib/api/aggregates";
import { vacanciesApi } from "@/lib/api/vacancies";
import { Snapshot } from "./_components/market-snapshot/Snapshot";
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

  const [aggregates, list] = await Promise.all([
    aggregatesApi.get(),
    vacanciesApi.list({ page, pageSize: PAGE_SIZE }),
  ]);

  const flatSearchParams: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flatSearchParams[k] = asString(v);
  }

  return (
    <>
      <Header links={snapshotNav} />
      <main className="flex min-h-screen flex-col bg-bg">
        <Snapshot aggregates={aggregates} />
        <VacancyList
          result={list}
          offset={offset}
          flatSearchParams={flatSearchParams}
        />
      </main>
      <Footer />
    </>
  );
}
