"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Eye,
  MousePointerClick,
  MoreHorizontal,
} from "lucide-react";

import type {
  AnalyticsPagePeoplePage,
  AnalyticsPagePeriod,
  AnalyticsPagePerson,
} from "@/lib/api/analytics-page";
import { formatCount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UrlSearch } from "@/ui/inputs/UrlSearch";
import { Panel } from "@/ui/layout/Panel";
import { Pagination } from "@/ui/navigation/Pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/overlay/Popover";

type SortableKey = "displayName" | "registeredAt" | "subscriptions" | "firstSubscriptionAt";

function formatMinutes(value: number | null): string {
  if (value == null) return "—";
  const days = Math.floor(value / 1_440);
  const hours = Math.floor((value % 1_440) / 60);
  const minutes = value % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" })
    .format(new Date(value))
    .toUpperCase();
}

function formatAgo(value: string | null): string {
  if (!value) return "—";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "NOW";
  if (hours < 24) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}

function PersonIdentity({ row }: { row: AnalyticsPagePerson }) {
  const telegramLogin = row.providers.includes("telegram");
  const googleLogin = row.providers.includes("google");
  return (
    <div className="min-w-0 w-[17rem] max-w-full">
      <p className="truncate font-medium text-text-primary">{row.displayName}</p>
      <div className="mt-1 flex items-center gap-2 overflow-hidden text-2xs">
        {row.telegramUsername ? (
          <a
            className="truncate text-accent underline underline-offset-2"
            href={`https://t.me/${row.telegramUsername}`}
            target="_blank"
            rel="noreferrer"
          >
            @{row.telegramUsername}
          </a>
        ) : row.email ? (
          <span className="truncate text-text-muted">{row.email}</span>
        ) : (
          <span className="text-text-muted">no contact profile</span>
        )}
        <span className="shrink-0 font-bold text-accent">
          {telegramLogin ? "TG" : ""}
          {telegramLogin && googleLogin ? " + " : ""}
          {googleLogin ? "Google" : ""}
        </span>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-border/60 py-2 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right text-text-primary">{value}</dd>
    </div>
  );
}

function PersonDetails({ row, available }: { row: AnalyticsPagePerson; available: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Open details for ${row.displayName}`}
          className="inline-flex size-8 items-center justify-center border border-border bg-bg text-text-secondary transition hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(23rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-border bg-bg px-4 py-3">
          <p className="truncate font-display text-sm font-semibold text-text-primary">
            {row.displayName}
          </p>
          <p className="mt-1 break-all text-2xs text-text-muted">{row.userId}</p>
        </div>
        <dl className="px-4 py-2">
          <Detail label="registered" value={formatDateTime(row.registeredAt)} />
          <Detail label="email" value={row.email ?? "—"} />
          <Detail
            label="Telegram"
            value={row.telegramUsername ? `@${row.telegramUsername}` : "not linked"}
          />
          <Detail
            label="login methods"
            value={row.providers.length ? row.providers.join(" + ") : "—"}
          />
          <Detail
            label="Telegram delivery"
            value={row.telegramLinked ? "active subscription chat" : "not connected"}
          />
          <Detail label="first subscription" value={formatDateTime(row.firstSubscriptionAt)} />
          <Detail
            label="active / total subscriptions"
            value={`${row.activeSubscriptions} / ${row.subscriptions}`}
          />
          {row.subscriptionDetails.map((subscription) => (
            <div key={subscription.id} className="border-b border-border/60 py-2 last:border-0">
              <p className="text-text-primary">
                {subscription.name ?? "Untitled subscription"} ·{" "}
                {subscription.isActive ? "active" : "inactive"}
              </p>
              <p className="mt-1 text-2xs text-text-muted">
                {Object.entries(subscription.params)
                  .slice(0, 4)
                  .map(
                    ([key, value]) =>
                      `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`,
                  )
                  .join(" · ") || "no filters"}
              </p>
              <p className="mt-1 text-2xs text-text-muted">
                created {formatDateTime(subscription.createdAt)}
              </p>
            </div>
          ))}
          {available ? (
            <>
              <Detail label="first seen" value={formatDateTime(row.firstEventAt)} />
              <Detail label="last seen" value={formatDateTime(row.lastEventAt)} />
              <Detail
                label="pageviews"
                value={row.pageviews == null ? "—" : formatCount(row.pageviews)}
              />
              <Detail
                label="last product action"
                value={row.lastAction?.replaceAll("_", " ") ?? "—"}
              />
              <Detail
                label="feed clicks"
                value={row.feedClicks == null ? "—" : formatCount(row.feedClicks)}
              />
              <Detail
                label="digest clicks"
                value={row.digestClicks == null ? "—" : formatCount(row.digestClicks)}
              />
              <Detail label="seen → registered" value={formatMinutes(row.minutesToRegistration)} />
              <Detail label="seen → subscribed" value={formatMinutes(row.minutesToSubscription)} />
            </>
          ) : null}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export function PeopleTable({
  people,
  available,
  period,
  source,
  q,
  sort,
  dir,
  offset,
  limit,
}: {
  people: AnalyticsPagePeoplePage;
  available: boolean;
  period: AnalyticsPagePeriod;
  source: string | undefined;
  q: string | undefined;
  sort: string | undefined;
  dir: "asc" | "desc";
  offset: number;
  limit: number;
}) {
  const baseParams: Record<string, string | undefined> = {
    period: period !== "30d" ? period : undefined,
    source,
    q,
    sort,
    dir: sort ? dir : undefined,
  };

  function sortHref(key: SortableKey) {
    const nextDir: "asc" | "desc" = sort === key && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    for (const [param, value] of Object.entries({ ...baseParams, sort: key, dir: nextDir })) {
      if (value) params.set(param, value);
    }
    return `/dashboard/analytics?${params.toString()}`;
  }

  function sortLink(sortKey: SortableKey, label: string) {
    const active = sort === sortKey;
    return (
      <Link
        href={sortHref(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap transition hover:text-accent",
          active ? "text-text-primary" : "text-text-muted",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </Link>
    );
  }

  return (
    <Panel title="Contacts" meta={`${people.total} accounts · one row = one account`}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UrlSearch placeholder="name or account ID…" />
        {!available ? (
          <span className="font-mono text-2xs text-text-muted">
            Activity details stay hidden until PostHog is available
          </span>
        ) : null}
      </div>

      {people.rows.length === 0 ? (
        <p className="font-mono text-xs text-text-muted">no accounts found</p>
      ) : null}

      <div className="hidden overflow-x-auto border border-border md:block">
        <table className="min-w-[1050px] w-full table-fixed border-collapse text-left font-mono text-xs">
          <thead className="bg-bg text-2xs uppercase tracking-[0.12em] text-text-muted">
            <tr className="border-b border-border">
              <th className="w-[290px] px-4 py-3 font-normal">
                {sortLink("displayName", "person")}
              </th>
              <th className="w-[245px] px-4 py-3 font-normal">contact</th>
              <th className="w-[175px] px-4 py-3 font-normal">connected</th>
              <th className="w-[110px] px-4 py-3 font-normal">first visit</th>
              <th className="w-[120px] px-4 py-3 text-right font-normal">outbound ↕</th>
              <th className="w-14 px-3 py-3" aria-label="Details" />
            </tr>
          </thead>
          <tbody>
            {people.rows.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-border/60 last:border-0 hover:bg-accent/[0.035]"
              >
                <td className="px-4 py-3">
                  <PersonIdentity row={row} />
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  <p className="truncate text-text-primary">
                    {row.telegramUsername ? `@${row.telegramUsername}` : (row.email ?? "—")}
                  </p>
                  <p className="mt-1 text-2xs text-text-muted">
                    {row.email && row.telegramUsername
                      ? row.email
                      : `${row.activeSubscriptions} active subs`}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex border px-2 py-1 text-2xs font-bold",
                      row.providers.includes("telegram")
                        ? "border-accent bg-accent text-bg"
                        : "border-border text-text-muted",
                    )}
                  >
                    TG
                  </span>
                  <span className="ml-1 inline-flex border border-border px-2 py-1 text-2xs font-bold text-text-primary">
                    {row.providers.includes("google") ? "G" : "—"}
                  </span>
                  <p
                    className={cn(
                      "mt-1 text-2xs",
                      row.telegramLinked ? "text-accent" : "text-text-muted",
                    )}
                  >
                    {row.telegramLinked ? "● delivery on" : "delivery off"}
                  </p>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  <span
                    title={formatDateTime(row.firstEventAt)}
                    className="cursor-help border-b border-dashed border-text-muted"
                  >
                    {formatShortDate(row.firstEventAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <p className="font-display text-lg font-semibold text-accent">
                    {formatCount((row.feedClicks ?? 0) + (row.digestClicks ?? 0))}
                  </p>
                  <p
                    title={formatDateTime(row.lastEventAt)}
                    className="cursor-help text-2xs text-text-muted"
                  >
                    {formatAgo(row.lastEventAt)}
                  </p>
                </td>
                <td className="px-3 py-3 text-right">
                  <PersonDetails row={row} available={available} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        <div className="flex gap-3 overflow-x-auto pb-1 font-mono text-2xs uppercase tracking-[0.12em]">
          {sortLink("displayName", "name")}
          {sortLink("registeredAt", "newest")}
          {sortLink("subscriptions", "subs")}
        </div>
        {people.rows.map((row) => (
          <article key={row.userId} className="border border-border bg-bg-card p-3 shadow-brut-2xs">
            <div className="flex items-start justify-between gap-3">
              <PersonIdentity row={row} />
              <PersonDetails row={row} available={available} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-px bg-border text-2xs">
              <div className="bg-bg p-2">
                <span className="flex items-center gap-1 text-text-muted">
                  <CalendarDays className="size-3" /> registered
                </span>
                <p className="mt-1 text-text-primary">{formatDateTime(row.registeredAt)}</p>
              </div>
              <div className="bg-bg p-2">
                <span className="text-text-muted">active subs</span>
                <p className="mt-1 font-semibold tabular-nums text-text-primary">
                  {row.activeSubscriptions} / {row.subscriptions}
                </p>
              </div>
              {available ? (
                <>
                  <div className="bg-bg p-2">
                    <span className="flex items-center gap-1 text-text-muted">
                      <Eye className="size-3" /> views
                    </span>
                    <p className="mt-1 font-semibold tabular-nums text-text-primary">
                      {row.pageviews == null ? "—" : formatCount(row.pageviews)}
                    </p>
                  </div>
                  <div className="bg-bg p-2">
                    <span className="flex items-center gap-1 text-text-muted">
                      <MousePointerClick className="size-3" /> clicks
                    </span>
                    <p className="mt-1 font-semibold tabular-nums text-text-primary">
                      {formatCount((row.feedClicks ?? 0) + (row.digestClicks ?? 0))}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4">
        <Pagination
          total={people.total}
          limit={limit}
          offset={offset}
          basePath="/dashboard/analytics"
          searchParams={baseParams}
        />
      </div>
    </Panel>
  );
}
