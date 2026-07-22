"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { InvestigationHeader } from "../../_components/InvestigationHeader";
import {
  isProductAnalyticsPeriod,
  isProductAnalyticsPopulation,
  productAnalyticsApi,
  type ProductAnalyticsOverview,
  type ProductAnalyticsPeriod,
  type ProductAnalyticsPopulation,
} from "@/lib/api/product-analytics";
import { formatCount, formatPercent, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tag } from "@/ui";
import { Donut } from "@/ui/charts/Donut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/overlay/Tooltip";
import { DashboardTabPanel, DashboardTabs, type DashboardTabItem } from "./DashboardTabs";
import { FunnelOverview } from "./FunnelOverview";
import { SubscriberIdentity } from "./SubscriberIdentity";
import { SubscriptionsPopover } from "./SubscriptionsPopover";

const EVENT_LABELS: Record<string, string> = {
  landing_view: "відкрили посадкову",
  landing_cta_clicked: "натиснули CTA",
  subscription_create_started: "почали підписку",
  subscription_created: "створили підписку",
  subscription_handoff_opened: "відкрили Telegram",
  telegram_linked: "прив’язали Telegram",
  activation_value_shown: "побачили перші вакансії",
  digest_sent: "отримали дайджест",
  digest_link_clicked: "перейшли до вакансії",
};

const PERIOD_OPTIONS: Array<{ value: ProductAnalyticsPeriod; label: string }> = [
  { value: "24h", label: "24 години" },
  { value: "week", label: "7 днів" },
  { value: "30d", label: "30 днів" },
  { value: "all", label: "весь час" },
];

const POPULATION_OPTIONS: Array<{ value: ProductAnalyticsPopulation; label: string }> = [
  { value: "production", label: "production" },
  { value: "test", label: "controlled tests" },
  { value: "all", label: "all traffic" },
];

const DASHBOARD_TABS: DashboardTabItem[] = [
  { value: "funnel", label: "воронка" },
  { value: "subscribers", label: "підписники" },
  { value: "identity", label: "identity" },
  { value: "journeys", label: "journeys" },
];

type RecentJourney = ProductAnalyticsOverview["recentJourneys"][number];
type JourneyClassificationInput = Pick<RecentJourney, "id" | "isTest" | "cohortId">;

export function ProductAnalyticsDashboard() {
  const [period, setPeriod] = useState<ProductAnalyticsPeriod>("week");
  const [population, setPopulation] = useState<ProductAnalyticsPopulation>("production");
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ["product-analytics", period, population],
    queryFn: () => productAnalyticsApi.overview(period, population),
    refetchInterval: 60_000,
  });
  const classifyJourney = useMutation({
    mutationFn: ({ id, isTest, cohortId }: JourneyClassificationInput) =>
      productAnalyticsApi.updateJourney(id, { isTest, cohortId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["product-analytics"] });
    },
    onError: () => {
      window.alert("Не вдалося оновити класифікацію journey.");
    },
  });

  function handlePeriodChange(event: ChangeEvent<HTMLSelectElement>) {
    if (isProductAnalyticsPeriod(event.target.value)) setPeriod(event.target.value);
  }

  function handlePopulationChange(event: ChangeEvent<HTMLSelectElement>) {
    if (isProductAnalyticsPopulation(event.target.value)) setPopulation(event.target.value);
  }

  function toggleTestJourney(journey: RecentJourney) {
    if (journey.isTest) {
      classifyJourney.mutate({ id: journey.id, isTest: false, cohortId: null });
      return;
    }
    markJourneyAsTest(journey);
  }

  function markJourneyAsTest(journey: RecentJourney) {
    const cohortId = window.prompt(
      "Cohort ID для контрольного трафіку (необов’язково, до 64 символів):",
      journey.cohortId ?? "",
    );
    if (cohortId === null) return;
    classifyJourney.mutate({
      id: journey.id,
      isTest: true,
      cohortId: cohortId.trim() || null,
    });
  }

  if (overview.isLoading) return <DashboardState message="завантажую журнал подій…" />;
  if (overview.isError || !overview.data) {
    return <DashboardState message="не вдалося завантажити аналітику" tone="danger" />;
  }

  const data = overview.data;
  const firstStep = data.funnel[0]?.journeys ?? 0;
  const latestStep = data.funnel.at(-1)?.journeys ?? 0;
  const identityIssues =
    data.identity.subscriptionsWithoutJourney +
    data.identity.trackedLinkedWithoutEvent +
    data.identity.trackedDeliveryWithoutEvent;

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="продуктова аналітика" />
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-10 md:px-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Tag>{"> activation ledger"}</Tag>
            <h1 className="font-display text-xl font-bold text-text-primary">
              браузер → API → Telegram → дайджест
            </h1>
            <p className="max-w-3xl font-mono text-xs text-text-secondary">
              First-party журнал без Telegram ID та профільних даних. Legacy-підписки показані
              окремо й не отримують вигаданих історичних подій.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
              population
              <select
                value={population}
                onChange={handlePopulationChange}
                className="border border-border bg-bg-card px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
              >
                {POPULATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
              період
              <select
                value={period}
                onChange={handlePeriodChange}
                className="border border-border bg-bg-card px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="нових підписок">
            {formatCount(data.subscriptions.createdInPeriod)}
          </MetricCard>
          <MetricCard label="активних">{formatCount(data.subscriptions.active)}</MetricCard>
          <MetricCard label="з доставкою">{formatCount(data.subscriptions.delivered)}</MetricCard>
          <MetricCard label="landing → vacancy click" tone="accent">
            {formatPercent(latestStep, firstStep)}
          </MetricCard>
        </section>

        <DashboardTabs items={DASHBOARD_TABS} defaultValue="funnel">
          <DashboardTabPanel value="funnel">
            <section className="border border-border bg-bg-card p-5 shadow-brut-md">
              <SectionTitle title="radar cohort" detail={`${population} · independent per-step`} />
              <div className="mt-5">
                <FunnelOverview funnel={data.funnel} labels={EVENT_LABELS} />
              </div>
              <div className="mt-6 flex flex-col gap-4">
                {data.funnel.map((step, index) => {
                  const previous = index === 0 ? step.journeys : data.funnel[index - 1].journeys;
                  const width = firstStep > 0 ? Math.max((step.journeys / firstStep) * 100, 2) : 0;
                  return (
                    <div
                      key={step.name}
                      className="grid gap-2 md:grid-cols-[220px_1fr_150px] md:items-center"
                    >
                      <span className="font-mono text-xs text-text-primary">
                        {EVENT_LABELS[step.name] ?? step.name}
                      </span>
                      <div className="h-7 border border-border bg-bg-elev">
                        <div className="h-full bg-accent/75" style={{ width: `${width}%` }} />
                      </div>
                      <span className="font-mono text-xs text-text-secondary md:text-right">
                        {formatCount(step.journeys)} journey ·{" "}
                        {formatPercent(step.journeys, previous)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
                <span className="inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-text-muted">
                  фід-кліки (незалежно від дайджест-воронки)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="що означають «фід-кліки» у воронці"
                        className="text-text-muted hover:text-accent"
                      >
                        ⓘ
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Кліки по вакансіях у веб-фіді (apply_clicked). Не частина лінійного ланцюга
                      вище — фід-клік можливий і без підписки, тож показаний окремим KPI, а не
                      кроком воронки.
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span className="font-display text-lg font-bold text-text-primary">
                  {formatCount(data.feedEngagement.journeys)}{" "}
                  <span className="font-mono text-xs font-normal text-text-muted">
                    journeys · {formatCount(data.feedEngagement.events)} кліків
                  </span>
                </span>
              </div>
            </section>
          </DashboardTabPanel>

          <DashboardTabPanel value="subscribers">
            <section className="border border-border bg-bg-card p-5 shadow-brut-md">
              <SectionTitle
                title="по підписниках"
                detail={`${data.subscriberActivity.length} підписників · дайджест-кліки ≠ фід-кліки`}
              />
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-left font-mono text-xs">
                  <thead className="text-2xs uppercase tracking-wider text-text-muted">
                    <tr className="border-b border-border">
                      <th className="pb-3 pr-4">підписник</th>
                      <th className="pb-3 pr-4">приєднався</th>
                      <th className="pb-3 pr-4">
                        <span className="inline-flex items-center gap-1">
                          перша подія
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="що означає «перша подія»"
                                className="text-text-muted hover:text-accent"
                              >
                                ⓘ
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Журнал подій існує лише з моменту релізу цієї аналітики. Для підписок,
                              створених раніше, це НЕ перший дотик користувача — лише перша
                              зафіксована подія. Дивіться «приєднався» для чесної дати.
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </th>
                      <th className="pb-3 pr-4">cta</th>
                      <th className="pb-3 pr-4">telegram</th>
                      <th className="pb-3 pr-4">підписки</th>
                      <th className="pb-3 pr-4">дайджест-кліки</th>
                      <th className="pb-3">
                        <span className="inline-flex items-center gap-1">
                          фід-кліки
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="що означають «фід-кліки»"
                                className="text-text-muted hover:text-accent"
                              >
                                ⓘ
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Кліки по вакансіях у веб-фіді (apply_clicked), окремо від кліків у
                              Telegram-дайджесті. Рахуються лише коли journey підписника має рівно
                              одну підписку — інакше клік не можна однозначно приписати.
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscriberActivity.map((subscriber) => (
                      <tr
                        key={subscriber.chatId}
                        className="border-b border-border/60 align-top text-text-secondary"
                      >
                        <td className="py-3 pr-4">
                          <SubscriberIdentity
                            tgUsername={subscriber.tgUsername}
                            tgFirstName={subscriber.tgFirstName}
                            chatId={subscriber.chatId}
                          />
                        </td>
                        <td className="py-3 pr-4 text-text-primary">
                          {formatRelative(subscriber.joinedAt)}
                        </td>
                        <td className="py-3 pr-4">{formatRelative(subscriber.firstSeenAt)}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={subscriber.ctaClickedAt ? "text-success" : "text-text-muted"}
                          >
                            {subscriber.ctaClickedAt
                              ? formatRelative(subscriber.ctaClickedAt)
                              : "—"}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={
                              subscriber.telegramLinkedAt ? "text-success" : "text-text-muted"
                            }
                          >
                            {subscriber.telegramLinkedAt
                              ? formatRelative(subscriber.telegramLinkedAt)
                              : "—"}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <SubscriptionsPopover subscriptions={subscriber.subscriptions} />
                        </td>
                        <td className="py-3 pr-4">{formatCount(subscriber.vacancyClicks)}</td>
                        <td className="py-3">{formatCount(subscriber.feedClicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </DashboardTabPanel>

          <DashboardTabPanel value="identity">
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="border border-border bg-bg-card p-5 shadow-brut-md">
                <SectionTitle title="стан підписок" detail={`${data.subscriptions.total} всього`} />
                <div className="mt-5 flex items-center gap-5 border-b border-border/60 pb-5">
                  <Donut
                    value={data.subscriptions.cv}
                    total={data.subscriptions.total}
                    label={formatPercent(data.subscriptions.cv, data.subscriptions.total)}
                    size={88}
                    thickness={11}
                    ariaLabel="частка CV-підписок серед усіх"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
                      cv проти feed
                    </span>
                    <span className="font-display text-xl font-bold text-text-primary">
                      {formatCount(data.subscriptions.cv)}{" "}
                      <span className="text-text-muted">
                        CV / {formatCount(data.subscriptions.feed)} feed
                      </span>
                    </span>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 font-mono text-xs">
                  <Stat label="linked" value={data.subscriptions.linked} />
                  <Stat label="pending" value={data.subscriptions.pending} />
                  <Stat label="feed" value={data.subscriptions.feed} />
                  <Stat label="CV" value={data.subscriptions.cv} />
                  <Stat label="deactivated" value={data.subscriptions.deactivated} />
                  <Stat
                    label="linked без delivery"
                    value={data.subscriptions.linkedWithoutDelivery}
                  />
                </dl>
              </div>
              <div
                className={cn(
                  "border bg-bg-card p-5 shadow-brut-md",
                  identityIssues === 0 ? "border-border" : "border-danger",
                )}
              >
                <SectionTitle
                  title="цілісність identity"
                  detail={
                    identityIssues === 0
                      ? "нових розривів не знайдено"
                      : `${identityIssues} розривів`
                  }
                />
                <dl className="mt-5 grid grid-cols-2 gap-3 font-mono text-xs">
                  <Stat label="journey всього" value={data.identity.journeysTotal} />
                  <Stat label="browser journey" value={data.identity.browserJourneys} />
                  <Stat label="server journey" value={data.identity.serverJourneys} />
                  <Stat label="legacy journey" value={data.identity.legacyJourneys} />
                  <Stat label="прив’язані до account" value={data.identity.accountLinkedJourneys} />
                  <Stat
                    label="account з кількома journey"
                    value={data.identity.multiJourneyUsers}
                  />
                  <Stat
                    label="journey з кількома subs"
                    value={data.identity.multiSubscriptionJourneys}
                  />
                  <Stat label="без journey_id" value={data.identity.subscriptionsWithoutJourney} />
                  <Stat label="linked без event" value={data.identity.trackedLinkedWithoutEvent} />
                  <Stat
                    label="delivery без event"
                    value={data.identity.trackedDeliveryWithoutEvent}
                  />
                  <Stat label="outbox очікує dispatch" value={data.identity.pendingOutboxEvents} />
                </dl>
              </div>
            </section>
          </DashboardTabPanel>

          <DashboardTabPanel value="journeys">
            <section className="border border-border bg-bg-card p-5 shadow-brut-md">
              <SectionTitle
                title="останні journey"
                detail={`оновлено ${formatRelative(data.generatedAt)}`}
              />
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-left font-mono text-xs">
                  <thead className="text-2xs uppercase tracking-wider text-text-muted">
                    <tr className="border-b border-border">
                      <th className="pb-3 pr-4">journey</th>
                      <th className="pb-3 pr-4">origin</th>
                      <th className="pb-3 pr-4">population</th>
                      <th className="pb-3 pr-4">cohort</th>
                      <th className="pb-3 pr-4">subs</th>
                      <th className="pb-3 pr-4">linked</th>
                      <th className="pb-3 pr-4">delivered</th>
                      <th className="pb-3 pr-4">events</th>
                      <th className="pb-3 pr-4">останній сигнал</th>
                      <th className="pb-3">дія</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentJourneys.map((journey) => (
                      <tr
                        key={journey.id}
                        className="border-b border-border/60 text-text-secondary"
                      >
                        <td className="py-3 pr-4 text-text-primary" title={journey.id}>
                          {journey.id.slice(0, 8)}…
                        </td>
                        <td className="py-3 pr-4">{journey.origin}</td>
                        <td className="py-3 pr-4">
                          <span className={journey.isTest ? "text-accent" : "text-success"}>
                            {journey.isTest ? "test" : "production"}
                          </span>
                        </td>
                        <td className="py-3 pr-4">{journey.cohortId ?? "—"}</td>
                        <td className="py-3 pr-4">{journey.subscriptions}</td>
                        <td className="py-3 pr-4">{journey.linkedSubscriptions}</td>
                        <td className="py-3 pr-4">{journey.deliveredSubscriptions}</td>
                        <td className="py-3 pr-4" title={journey.eventNames.join(", ")}>
                          {journey.events}
                        </td>
                        <td className="py-3 pr-4">
                          {formatRelative(journey.lastEventAt ?? journey.lastSeenAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            {journey.isTest ? (
                              <button
                                type="button"
                                disabled={classifyJourney.isPending}
                                onClick={() => markJourneyAsTest(journey)}
                                className="border border-border px-2 py-1 text-2xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                              >
                                edit cohort
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={classifyJourney.isPending}
                              onClick={() => toggleTestJourney(journey)}
                              className="border border-border px-2 py-1 text-2xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              {journey.isTest ? "mark production" : "mark test"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </DashboardTabPanel>
        </DashboardTabs>
      </div>
    </main>
  );
}

function DashboardState({
  message,
  tone = "default",
}: {
  message: string;
  tone?: "default" | "danger";
}) {
  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="продуктова аналітика" />
      <div
        className={cn(
          "p-10 font-mono text-sm",
          tone === "danger" ? "text-danger" : "text-text-muted",
        )}
      >
        {message}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "accent";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-36 flex-col justify-between border bg-bg-card p-5 shadow-brut-md",
        tone === "accent" ? "border-accent" : "border-border",
      )}
    >
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">{label}</span>
      <strong
        className={cn(
          "font-display text-4xl",
          tone === "accent" ? "text-accent" : "text-text-primary",
        )}
      >
        {children}
      </strong>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-base font-bold text-text-primary">{title}</h2>
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">{detail}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{formatCount(value)}</dd>
    </div>
  );
}
