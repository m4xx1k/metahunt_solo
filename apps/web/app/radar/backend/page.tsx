import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
  PaperPlaneTiltIcon,
  StackIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Footer } from "@/app/_components/Footer";
import { Header } from "@/app/_components/Header";
import { readAcquisitionAttribution } from "@/lib/acquisition-attribution";
import { aggregatesApi } from "@/lib/api/aggregates";
import { publicApiBase } from "@/lib/api/client";
import type { SubscriptionParams } from "@/lib/api/subscriptions";
import { tracksApi } from "@/lib/api/tracks";
import { vacanciesApi, type VacancyDto } from "@/lib/api/vacancies";
import { formatSalary, SENIORITY_LABELS } from "@/lib/extracted-vacancy";
import { formatRelative } from "@/lib/format";
import { Badge, Card, Tag } from "@/ui";
import { chipClass } from "@/ui/inputs/pill";
import { RadarSubscribe } from "./_components/RadarSubscribe";

const PROOF_VACANCY_COUNT = 3;
const TEASER_SKILL_COUNT = 3;

const SITE_URL = "https://www.metahunt.app";
const TRACK_SLUG = "backend";
const DEFAULT_FRESHNESS_DAYS = 30;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Радар backend-вакансій в Telegram · metahunt",
  description: "Нові backend-вакансії з DOU і Djinni, без дублів, прямо в Telegram. Без резюме.",
  alternates: { canonical: `${SITE_URL}/radar/backend` },
  openGraph: {
    title: "Не перевіряй DOU і Djinni вручну",
    description: "Безкоштовний радар backend-вакансій. Тільки нові — прямо в Telegram.",
    url: `${SITE_URL}/radar/backend`,
    siteName: "metahunt",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Радар backend-вакансій · metahunt",
    description: "Нові backend-вакансії з DOU і Djinni — прямо в Telegram.",
  },
};

export default async function BackendRadarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [aggregates, preset, rawSearchParams] = await Promise.all([
    aggregatesApi.get(),
    tracksApi.preset(TRACK_SLUG),
    searchParams,
  ]);
  const params: SubscriptionParams = {
    roleIds: preset.roles.map((role) => role.id),
    skillIds: preset.skills.map((skill) => skill.id),
    postedWithinDays: DEFAULT_FRESHNESS_DAYS,
  };
  const backendJobs = await vacanciesApi.list({
    ...params,
    page: 1,
    pageSize: PROOF_VACANCY_COUNT,
  });
  const attribution = readAcquisitionAttribution(rawSearchParams);
  const lastSync = formatKyivTime(aggregates.lastSyncAt);

  return (
    <>
      <Header
        links={[
          { label: "як це працює", href: "#how" },
          { label: "приватність", href: "/privacy" },
        ]}
        cta={null}
      />
      <main
        className="bg-bg"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,179,128,0.08), transparent 70%), radial-gradient(var(--color-border) 1px, transparent 1px)",
          backgroundSize: "auto, 22px 22px",
        }}
      >
        <section className="border-b border-border px-6 py-20 md:px-12 md:py-28">
          <div className="mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="flex flex-col items-start gap-7">
              <Tag>&gt; DOU + DJINNI</Tag>
              <h1 className="max-w-[850px] font-display text-4xl font-black leading-[1.05] tracking-tight text-text-primary sm:text-6xl">
                Backend-вакансії. Щодня в Telegram.
              </h1>
              <p className="max-w-[700px] text-lg leading-relaxed text-text-secondary">
                Свіжі вакансії з DOU і Djinni — щодня в Telegram. Без реєстрації, дублі склеєні.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <RadarSubscribe params={params} attribution={attribution} trackImpression />
                <Link
                  href="/backend"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-wider text-text-secondary transition-colors hover:text-accent"
                >
                  Спочатку подивитись →
                </Link>
              </div>
              <p className="font-mono text-xs leading-relaxed text-text-muted">
                Без CV, без акаунта. Один тап — і ти в Telegram.
              </p>
            </div>

            <Card className="gap-5 shadow-brut-xl">
              <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
                <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                  Свіжі backend-вакансії
                </p>
                <span className="inline-flex items-center gap-2 font-mono text-xs text-success">
                  <span className="h-2 w-2 bg-success" aria-hidden /> онлайн
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {backendJobs.items.length > 0 ? (
                  backendJobs.items.map((vacancy) => (
                    <VacancyTeaser key={vacancy.id} vacancy={vacancy} />
                  ))
                ) : (
                  <p className="border border-border bg-bg p-4 font-mono text-xs text-text-secondary">
                    Зараз свіжих немає — радар перевіряє щогодини.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border pt-4 font-mono text-2xs uppercase tracking-wider text-text-muted">
                <span>{backendJobs.total} backend-вакансій · 30 днів</span>
                <span>оновлено {lastSync}</span>
              </div>
            </Card>
          </div>
        </section>

        <section id="how" className="px-6 py-20 md:px-12">
          <div className="mx-auto w-full max-w-[1180px]">
            <div className="mb-10 max-w-[700px]">
              <Tag>&gt; як це працює</Tag>
              <h2 className="mt-4 font-display text-3xl font-bold text-text-primary sm:text-4xl">
                Один простий цикл, не ще один дашборд.
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Step
                icon={<FunnelIcon className="h-6 w-6" aria-hidden />}
                number="01"
                title="Стартуй з Backend"
                body="Роль вже готова, стек і рівень тонко налаштуй у фіді."
              />
              <Step
                icon={<StackIcon className="h-6 w-6" aria-hidden />}
                number="02"
                title="Дублі не проходять"
                body="Однакові вакансії з різних сайтів — одна картка."
              />
              <Step
                icon={<PaperPlaneTiltIcon className="h-6 w-6" aria-hidden />}
                number="03"
                title="Telegram сам нагадає"
                body="Перевірка щогодини з 9:30 до 21:30, тиша без новин."
              />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-bg-elev px-6 py-16 md:px-12">
          <div className="mx-auto grid w-full max-w-[1180px] gap-8 md:grid-cols-3">
            <TrustPoint
              icon={<CheckCircleIcon className="h-5 w-5" aria-hidden />}
              title="Без резюме"
              body="Дивись вакансії одразу, CV — потім і за бажанням."
            />
            <TrustPoint
              icon={<ClockIcon className="h-5 w-5" aria-hidden />}
              title="Тільки нове"
              body="Що вже надсилали — вдруге не покажемо."
            />
            <TrustPoint
              icon={<PaperPlaneTiltIcon className="h-5 w-5" aria-hidden />}
              title="Контроль у тебе"
              body="/list — переглянути, /stop — вимкнути одним тапом."
            />
          </div>
        </section>

        <section className="px-6 py-20 text-center md:px-12">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <Tag>&gt; без ручного пошуку</Tag>
            <h2 className="font-display text-3xl font-bold text-text-primary sm:text-4xl">
              Нехай наступна вакансія знайде тебе сама.
            </h2>
            <RadarSubscribe params={params} attribution={attribution} />
            <Link href="/privacy" className="text-xs text-text-muted underline hover:text-accent">
              Як MetaHunt працює з даними
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

// Static supply proof — mirrors the feed card's fields (role, seniority,
// company, salary, source, posted-at, apply link, top skills) at hero scale,
// without the feed card's interactive dedup drawer / full skill list.
function VacancyTeaser({ vacancy: v }: { vacancy: VacancyDto }) {
  const role = v.role?.name ?? "вакансія без назви";
  const salary = formatSalary({
    min: v.salary.min,
    max: v.salary.max,
    currency: v.salary.currency,
  });
  const skills = [...v.skills.required, ...v.skills.optional].slice(0, TEASER_SKILL_COUNT);

  return (
    <Card className="gap-2 p-4 shadow-brut-sm">
      <div className="flex items-center justify-between gap-3 font-mono text-2xs uppercase tracking-wider text-text-muted">
        <span>{v.source.displayName.trim()}</span>
        <span>{formatRelative(v.publishedAt)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {v.seniority ? <Badge variant="dark">{SENIORITY_LABELS[v.seniority]}</Badge> : null}
        <h3 className="break-words font-mono text-sm font-bold leading-snug text-text-primary">
          {role}
        </h3>
      </div>
      {v.company?.name || salary ? (
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
          {v.company?.name ? <span className="text-text-secondary">{v.company.name}</span> : null}
          {salary ? <span className="font-bold text-success">{salary}</span> : null}
        </div>
      ) : null}
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 overflow-hidden">
          {skills.map((s) => (
            <span key={s.id} className={chipClass(false)}>
              {s.name.toLowerCase()}
            </span>
          ))}
        </div>
      ) : null}
      {v.link ? (
        // Same `/go/:id` redirect the feed card uses, so hero taps get logged too.
        <a
          href={`${publicApiBase()}/go/${v.id}`}
          target="_blank"
          rel="noreferrer noopener"
          className="w-fit font-mono text-2xs text-accent hover:underline"
        >
          ↗ дивитись
        </a>
      ) : null}
    </Card>
  );
}

function Step({
  icon,
  number,
  title,
  body,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="h-full shadow-brut-sm">
      <div className="flex items-center justify-between text-accent">
        {icon}
        <span className="font-mono text-xs">{number}</span>
      </div>
      <h3 className="font-display text-xl font-bold text-text-primary">{title}</h3>
      <p className="text-sm leading-relaxed text-text-secondary">{body}</p>
    </Card>
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

function formatKyivTime(value: string | null): string {
  if (!value) return "очікує синхронізації";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
    timeZoneName: "short",
  }).format(new Date(value));
}
