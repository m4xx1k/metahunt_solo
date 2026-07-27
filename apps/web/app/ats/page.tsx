import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { atsApi, type AtsCompaniesResponse } from "@/lib/api/ats";
import { pageMetadata } from "@/lib/seo/metadata";
import { Tag } from "@/ui";

import { BoardsEmpty, CompanyBoard } from "./_components/CompanyBoard";

export const dynamic = "force-dynamic";

const PER_COMPANY = 6;

export const metadata: Metadata = pageMetadata({
  title: "Вакансії напряму з сайтів компаній",
  description:
    "Вакансії, зібрані з власних кар'єрних сторінок компаній, а не з агрегаторів. Згруповані по компаніях.",
  path: "/ats",
});

export default async function AtsPage({
  searchParams,
}: {
  searchParams: Promise<{ ua?: string }>;
}) {
  const { ua } = await searchParams;
  const uaOnly = ua === "1";

  const data: AtsCompaniesResponse = await atsApi
    .companies({ perCompany: PER_COMPANY, uaOnly })
    .catch(() => ({ companies: [], totals: { companies: 0, vacancies: 0, uaVacancies: 0 } }));

  return (
    <>
      <Header links={[{ label: "усі вакансії", href: "/" }]} cta={null} />
      <main
        className="bg-bg"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,179,128,0.08), transparent 70%), radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "auto, 22px 22px",
        }}
      >
        <section className="border-b border-border px-6 py-14 md:px-12 md:py-16">
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5">
            <Tag>&gt; НАПРЯМУ З САЙТІВ КОМПАНІЙ</Tag>
            <h1 className="text-2xl font-medium md:text-3xl">Вакансії без агрегаторів</h1>
            <p className="max-w-[62ch] text-sm text-fg-muted">
              Зібрано з власних кар&apos;єрних сторінок компаній. Тут немає посередників, дублікатів
              і перепощених оголошень — тільки те, що роботодавець опублікував сам.{" "}
              <span className="text-fg">✓</span> біля зарплати означає, що суму вказала компанія, а
              не витягнув наш аналіз тексту.
            </p>

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-fg-muted">
              <span>{data.totals.companies} компаній</span>
              <span>{data.totals.vacancies} вакансій</span>
              <span>{data.totals.uaVacancies} в Україні</span>
              <Link
                href={uaOnly ? "/ats" : "/ats?ua=1"}
                className="rounded border border-border px-2 py-1 transition-colors hover:bg-surface"
              >
                {uaOnly ? "показати всі" : "тільки Україна"}
              </Link>
            </div>
          </div>
        </section>

        <section className="px-6 py-10 md:px-12">
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4">
            {data.companies.length === 0 ? (
              <BoardsEmpty />
            ) : (
              data.companies.map((company) => (
                <CompanyBoard key={`${company.atsType}:${company.name}`} company={company} />
              ))
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
