import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
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
import type { SubscriptionParams } from "@/lib/api/subscriptions";
import { tracksApi } from "@/lib/api/tracks";
import { vacanciesApi } from "@/lib/api/vacancies";
import { Card, Tag } from "@/ui";
import { RadarSubscribe } from "./_components/RadarSubscribe";

const SITE_URL = "https://www.metahunt.app";
const TRACK_SLUG = "backend";
const DEFAULT_FRESHNESS_DAYS = 30;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Backend job radar for Ukraine · metahunt",
  description:
    "New Backend jobs from DOU and Djinni, deduplicated and delivered to Telegram. No CV required.",
  alternates: { canonical: `${SITE_URL}/radar/backend` },
  openGraph: {
    title: "Stop checking DOU and Djinni manually",
    description: "Create a free Backend job radar. Get only new matching vacancies in Telegram.",
    url: `${SITE_URL}/radar/backend`,
    siteName: "metahunt",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Backend job radar · metahunt",
    description: "New Backend jobs from DOU and Djinni, delivered to Telegram.",
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
    pageSize: 1,
  });
  const attribution = readAcquisitionAttribution(rawSearchParams);
  const lastSync = formatKyivTime(aggregates.lastSyncAt);

  return (
    <>
      <Header
        links={[
          { label: "how it works", href: "#how" },
          { label: "privacy", href: "/privacy" },
        ]}
        cta={null}
      />
      <main className="bg-bg">
        <section className="border-b border-border px-6 py-20 md:px-12 md:py-28">
          <div className="mx-auto grid w-full max-w-[1180px] gap-12 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="flex flex-col items-start gap-7">
              <Tag>&gt; backend radar · early access</Tag>
              <h1 className="max-w-[850px] font-display text-4xl font-black leading-[1.05] tracking-tight text-text-primary sm:text-6xl">
                Stop checking job boards. Get new Backend roles in Telegram.
              </h1>
              <p className="max-w-[700px] text-lg leading-relaxed text-text-secondary">
                MetaHunt pulls Backend vacancies from DOU and Djinni, structures the details,
                removes repeat listings, and sends only new matches to your chat.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                <RadarSubscribe params={params} attribution={attribution} trackImpression />
                <Link
                  href="/backend"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-wider text-text-secondary transition-colors hover:text-accent"
                >
                  Browse first <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <p className="font-mono text-xs leading-relaxed text-text-muted">
                No CV. No site account. Open Telegram, stop in one tap.
              </p>
            </div>

            <Card className="gap-6 shadow-brut-xl">
              <div className="flex items-end justify-between gap-4 border-b border-border pb-5">
                <div>
                  <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                    Backend jobs · last 30 days
                  </p>
                  <p className="mt-2 font-display text-5xl font-black text-accent">
                    {backendJobs.total}
                  </p>
                </div>
                <span className="mb-2 inline-flex items-center gap-2 font-mono text-xs text-success">
                  <span className="h-2 w-2 bg-success" aria-hidden /> live
                </span>
              </div>
              <dl className="grid gap-4 font-mono text-xs">
                <ProofRow label="sources" value="DOU + Djinni" />
                <ProofRow label="schedule" value="hourly · daytime" />
                <ProofRow label="last sync" value={lastSync} />
              </dl>
            </Card>
          </div>
        </section>

        <section id="how" className="px-6 py-20 md:px-12">
          <div className="mx-auto w-full max-w-[1180px]">
            <div className="mb-10 max-w-[700px]">
              <Tag>&gt; what happens next</Tag>
              <h2 className="mt-4 font-display text-3xl font-bold text-text-primary sm:text-4xl">
                One useful loop, not another job-search dashboard.
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Step
                icon={<FunnelIcon className="h-6 w-6" aria-hidden />}
                number="01"
                title="Start with Backend"
                body="Your radar begins with the verified Backend role. Fine-tune stack, format, seniority, freshness, and other filters in the full feed."
              />
              <Step
                icon={<StackIcon className="h-6 w-6" aria-hidden />}
                number="02"
                title="We remove repeat work"
                body="Listings are structured into comparable fields and same-job reposts are collapsed before they reach the feed."
              />
              <Step
                icon={<PaperPlaneTiltIcon className="h-6 w-6" aria-hidden />}
                number="03"
                title="Telegram brings the new ones"
                body="The radar checks hourly from 09:30 to 21:30 Kyiv time and stays quiet when there are no new matches."
              />
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-bg-elev px-6 py-16 md:px-12">
          <div className="mx-auto grid w-full max-w-[1180px] gap-8 md:grid-cols-3">
            <TrustPoint
              icon={<CheckCircleIcon className="h-5 w-5" aria-hidden />}
              title="No CV required"
              body="See the actual inventory and activate a role-based radar first. CV matching stays optional."
            />
            <TrustPoint
              icon={<ClockIcon className="h-5 w-5" aria-hidden />}
              title="New jobs only"
              body="Sent vacancies are remembered per subscription, so later digests do not repeat them."
            />
            <TrustPoint
              icon={<PaperPlaneTiltIcon className="h-5 w-5" aria-hidden />}
              title="You stay in control"
              body="Use /list to review alerts, unsubscribe in one tap, or use /stop directly in Telegram."
            />
          </div>
        </section>

        <section className="px-6 py-20 text-center md:px-12">
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-6">
            <Tag>&gt; reclaim the daily search</Tag>
            <h2 className="font-display text-3xl font-bold text-text-primary sm:text-4xl">
              Let the next relevant Backend role find you.
            </h2>
            <RadarSubscribe params={params} attribution={attribution} />
            <Link href="/privacy" className="text-xs text-text-muted underline hover:text-accent">
              How MetaHunt handles your data
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className="text-right text-text-primary">{value}</dd>
    </div>
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
  if (!value) return "awaiting sync";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
    timeZoneName: "short",
  }).format(new Date(value));
}
