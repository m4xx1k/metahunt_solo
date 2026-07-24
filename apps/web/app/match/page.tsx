import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircleIcon, EyeSlashIcon, ListChecksIcon } from "@phosphor-icons/react/dist/ssr";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { readAcquisitionAttribution } from "@/lib/acquisition-attribution";
import { aggregatesApi } from "@/lib/api/aggregates";
import { tracksApi } from "@/lib/api/tracks";
import { formatKyivTime } from "@/lib/format";
import { Tag } from "@/ui";

import { MatchStepper } from "./_components/MatchStepper";

const SITE_URL = "https://www.metahunt.app";
const HERO_DISCIPLINES = 8;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Вакансії під твій стек · metahunt",
  description:
    "MetaHunt показує тільки релевантні вакансії — і доводить, чому кожна з них твоя. 2 хвилини: CV або навички вручну — і добірка з DOU та Djinni готова.",
  alternates: { canonical: `${SITE_URL}/match` },
  openGraph: {
    title: "Тільки релевантні вакансії — з доказами",
    description:
      "Скинь CV або обери навички — побачиш лише вакансії під свій стек, зі збігом на кожній картці.",
    url: `${SITE_URL}/match`,
    siteName: "metahunt",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Вакансії під твій стек · metahunt",
    description: "Тільки релевантні вакансії з DOU і Djinni — з доказом на кожній картці.",
  },
};

export default async function MatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [aggregates, { tracks }, rawSearchParams] = await Promise.all([
    aggregatesApi.get(),
    tracksApi.get(),
    searchParams,
  ]);
  const attribution = readAcquisitionAttribution(rawSearchParams);

  const disciplines = tracks
    .filter((t) => t.parentSlug === null && t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, HERO_DISCIPLINES);

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
        <section className="border-b border-border px-6 pb-12 pt-16 md:px-12 md:pb-16 md:pt-24">
          <div className="mx-auto flex w-full max-w-[880px] flex-col items-center gap-6 text-center">
            <Tag>&gt; DOU + DJINNI · ПІД ТВІЙ СТЕК</Tag>
            <h1 className="font-display text-4xl font-black leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
              Тільки релевантні вакансії.
            </h1>
            <p className="max-w-[680px] text-lg leading-relaxed text-text-secondary">
              MetaHunt показує тільки вакансії під твій стек — і доводить, чому кожна з них твоя. 2
              хвилини: CV або навички вручну.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-xs text-text-muted">
              <span>
                <span className="font-bold text-accent">{aggregates.total}</span> вакансій · 30 днів
              </span>
              {aggregates.sources.map((s) => (
                <span key={s.id}>
                  {s.displayName.trim()} <span className="text-text-secondary">{s.count}</span>
                </span>
              ))}
              <span>оновлено {formatKyivTime(aggregates.lastSyncAt)}</span>
            </div>

            {disciplines.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {disciplines.map((d) => (
                  <span
                    key={d.slug}
                    className="inline-flex items-center gap-1.5 border border-border bg-bg-card px-2.5 py-1 font-mono text-2xs uppercase tracking-wider text-text-secondary"
                  >
                    {d.label}
                    <span className="text-accent">{d.count}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 md:px-12 md:py-14">
          <div className="mx-auto w-full max-w-[880px]">
            <Suspense fallback={null}>
              <MatchStepper attribution={attribution} />
            </Suspense>
          </div>
        </section>

        <section className="border-t border-border bg-bg-elev px-6 py-12 md:px-12">
          <div className="mx-auto grid w-full max-w-[1180px] gap-8 md:grid-cols-3">
            <TrustPoint
              icon={<EyeSlashIcon className="h-5 w-5" aria-hidden />}
              title="CV не зберігаємо"
              body="Витягуємо навички — сирий текст не персиститься. Профіль можна зібрати й без файлу."
            />
            <TrustPoint
              icon={<ListChecksIcon className="h-5 w-5" aria-hidden />}
              title="Доказ на кожній картці"
              body="✅ маєш · ❌ бракує · ➕ твій бонус — видно, чому вакансія в добірці."
            />
            <TrustPoint
              icon={<CheckCircleIcon className="h-5 w-5" aria-hidden />}
              title="Чесно про збіг"
              body="STRETCH — це «довгий шанс», не «майже твоє». Краще порожньо, ніж розбавлено."
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function TrustPoint({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="mt-0.5 text-success">{icon}</div>
      <div>
        <h3 className="font-display text-base font-bold text-text-primary">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{body}</p>
      </div>
    </div>
  );
}
