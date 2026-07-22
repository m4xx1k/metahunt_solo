import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { tracksApi, type TrackDto } from "@/lib/api/tracks";
import { Tag } from "@/ui";

const SITE_URL = "https://www.metahunt.app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Радар вакансій в Telegram · metahunt",
  description:
    "Обери напрям — і отримуй нові IT-вакансії з DOU і Djinni щодня в Telegram. Без резюме, без дублів.",
  alternates: { canonical: `${SITE_URL}/radar` },
  openGraph: {
    title: "Обери напрям — радар сам знайде вакансії",
    description:
      "Backend, frontend, QA, data, devops та інші напрями. Тільки нові — прямо в Telegram.",
    url: `${SITE_URL}/radar`,
    siteName: "metahunt",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Радар вакансій · metahunt",
    description: "Обери напрям — нові IT-вакансії щодня в Telegram.",
  },
};

// Same "has real supply" rule as the feed's TracksBand: a discipline is worth
// promoting either by its own count, or because a stack child has one.
function hasSupply(discipline: TrackDto, all: TrackDto[]): boolean {
  if (discipline.count > 0) return true;
  return all.some((t) => t.parentSlug === discipline.slug && t.count > 0);
}

export default async function RadarIndexPage() {
  const { tracks } = await tracksApi.get();
  const disciplines = tracks
    .filter((t) => t.parentSlug === null)
    .filter((t) => hasSupply(t, tracks))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <Header links={[{ label: "приватність", href: "/privacy" }]} cta={null} />
      <main
        className="bg-bg"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,179,128,0.08), transparent 70%), radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "auto, 22px 22px",
        }}
      >
        <section className="border-b border-border px-6 py-20 md:px-12 md:py-28">
          <div className="mx-auto flex w-full max-w-[820px] flex-col items-center gap-7 text-center">
            <Tag>&gt; DOU + DJINNI</Tag>
            <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-text-primary sm:text-6xl">
              Обери напрям. Радар знайде вакансії.
            </h1>
            <p className="max-w-[650px] text-lg leading-relaxed text-text-secondary">
              Нові вакансії з DOU і Djinni — щодня в Telegram. Без реєстрації, дублі склеєні.
            </p>
          </div>
        </section>

        <section className="px-6 py-16 md:px-12">
          <div className="mx-auto w-full max-w-[1180px]">
            <p className="mb-6 font-mono text-2xs uppercase tracking-[0.18em] text-text-muted">
              Обери напрям
            </p>
            {disciplines.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {disciplines.map((d) => (
                  <DisciplineCard key={d.slug} discipline={d} />
                ))}
              </div>
            ) : (
              <p className="border border-border bg-bg-card p-4 font-mono text-xs text-text-secondary">
                Зараз напрямів немає — радар перевіряє щогодини.
              </p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function DisciplineCard({ discipline }: { discipline: TrackDto }) {
  return (
    <Link
      href={`/radar/${discipline.slug}`}
      className="group flex items-center justify-between gap-4 border border-border bg-bg-card px-5 py-4 shadow-brut-sm transition-[transform,box-shadow] hover:-translate-y-[2px] hover:shadow-brut"
    >
      <span className="font-display text-lg font-bold text-text-primary group-hover:text-accent">
        {discipline.label}
      </span>
      {discipline.count > 0 ? (
        <span className="shrink-0 font-mono text-xs text-text-muted">
          {discipline.count} вакансій
        </span>
      ) : null}
    </Link>
  );
}
