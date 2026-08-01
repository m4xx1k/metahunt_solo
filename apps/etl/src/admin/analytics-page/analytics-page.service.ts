import { Inject, Injectable } from "@nestjs/common";

import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { PostHogQueryClient } from "../../platform/analytics/posthog-query.client";

import {
  type AnalyticsPageActiveUsers,
  type AnalyticsPageFunnelStep,
  type AnalyticsPageMetrics,
  type AnalyticsPagePeoplePage,
  type AnalyticsPagePeopleQuery,
  type AnalyticsPagePeopleSort,
  type AnalyticsPagePeriod,
  type AnalyticsPagePerson,
  type AnalyticsPageSource,
} from "./analytics-page.contract";
import { clampedMinutesBetween } from "./analytics-page.derive";

const PEOPLE_PAGE_MAX = 100;

const PERIOD_DAYS: Record<AnalyticsPagePeriod, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const FUNNEL_STEP_META: Array<{ step: string; label: string }> = [
  { step: "visited", label: "Visited" },
  { step: "started", label: "Started subscription" },
  { step: "handoff", label: "Opened handoff" },
  { step: "linked", label: "Linked Telegram" },
];

interface RosterRow {
  personId: string;
  displayName: string;
  hasAccount: boolean;
  providers: string[];
  registeredAt: string | null;
  subscriptions: number;
  activeSubscriptions: number;
  firstSubscriptionAt: string | null;
  telegramLinked: boolean;
}

interface PostHogPersonSide {
  firstEventAt: string | null;
  lastEventAt: string | null;
  pageviews: number;
  feedClicks: number;
  digestClicks: number;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// PostHog query rows are `Record<string, unknown>` — narrow before
// stringifying so an unexpected shape can't stringify to "[object Object]".
function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function toIsoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// One decimal place, null when there's no prior-step population to divide by
// (rather than a misleading 0%/Infinity).
function conversionRate(prev: number, current: number): number | null {
  if (prev <= 0) return null;
  return Math.round((current / prev) * 1000) / 10;
}

// HogQL has no bind params on this endpoint (see PostHogQueryClient) — every
// interpolated value here is either a fixed server-side enum (period → days)
// or this escape, never raw user input passed through unescaped.
function escapeHogql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

@Injectable()
export class AnalyticsPageService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly posthogQueryClient: PostHogQueryClient,
  ) {}

  async metrics(period: AnalyticsPagePeriod, source?: string): Promise<AnalyticsPageMetrics> {
    const empty: AnalyticsPageMetrics = {
      available: false,
      activeUsers: { dau: 0, wau: 0, mau: 0 },
      funnel: FUNNEL_STEP_META.map((meta) => ({ ...meta, people: 0, conversionFromPrev: null })),
      ctaClicks: 0,
      sources: [],
    };
    if (!this.posthogQueryClient.isAvailable()) return empty;

    const periodDays = PERIOD_DAYS[period];
    const sourceFilter = source
      ? ` AND properties.$referring_domain = '${escapeHogql(source)}'`
      : "";

    const [activeUsersRows, funnelRows, sourceRows] = await Promise.all([
      this.posthogQueryClient.query(this.activeUsersQuery(periodDays, sourceFilter)),
      this.posthogQueryClient.query(this.funnelQuery(periodDays, sourceFilter)),
      this.posthogQueryClient.query(this.sourcesQuery(periodDays)),
    ]);

    // All three null means every query failed (outage/timeout/rate-limit),
    // not a genuinely empty window — report unavailable rather than zeroes.
    if (activeUsersRows === null && funnelRows === null && sourceRows === null) {
      return empty;
    }

    const activeUsersRow = activeUsersRows?.[0];
    const activeUsers: AnalyticsPageActiveUsers = {
      dau: toNumber(activeUsersRow?.dau),
      wau: toNumber(activeUsersRow?.wau),
      mau: toNumber(activeUsersRow?.mau),
    };

    const funnelRow = funnelRows?.[0];
    const visited = toNumber(funnelRow?.visited);
    const started = toNumber(funnelRow?.started);
    const handoff = toNumber(funnelRow?.handoff);
    const linked = toNumber(funnelRow?.linked);
    const cta = toNumber(funnelRow?.cta);

    const funnel: AnalyticsPageFunnelStep[] = [
      { ...FUNNEL_STEP_META[0], people: visited, conversionFromPrev: null },
      {
        ...FUNNEL_STEP_META[1],
        people: started,
        conversionFromPrev: conversionRate(visited, started),
      },
      {
        ...FUNNEL_STEP_META[2],
        people: handoff,
        conversionFromPrev: conversionRate(started, handoff),
      },
      {
        ...FUNNEL_STEP_META[3],
        people: linked,
        conversionFromPrev: conversionRate(handoff, linked),
      },
    ];

    const sources: AnalyticsPageSource[] = (sourceRows ?? []).map((row) => ({
      source: toStringOrEmpty(row.source) || "direct",
      people: toNumber(row.people),
    }));

    return { available: true, activeUsers, funnel, ctaClicks: cta, sources };
  }

  async people(query: AnalyticsPagePeopleQuery): Promise<AnalyticsPagePeoplePage> {
    const limit = Math.min(query.limit, PEOPLE_PAGE_MAX);
    const offset = Math.max(query.offset, 0);
    const { total, rows } = await this.roster(query, limit, offset);
    if (rows.length === 0) return { total, rows: [] };

    const postHogByPersonId = this.posthogQueryClient.isAvailable()
      ? await this.fetchPostHogPeopleSide(rows.map((row) => row.personId))
      : new Map<string, PostHogPersonSide>();

    const merged: AnalyticsPagePerson[] = rows.map((row) => {
      const postHog = postHogByPersonId.get(row.personId) ?? null;
      return {
        ...row,
        firstEventAt: postHog?.firstEventAt ?? null,
        lastEventAt: postHog?.lastEventAt ?? null,
        pageviews: postHog?.pageviews ?? null,
        feedClicks: postHog?.feedClicks ?? null,
        digestClicks: postHog?.digestClicks ?? null,
        minutesToRegistration: clampedMinutesBetween(
          postHog?.firstEventAt ?? null,
          row.registeredAt,
        ),
        minutesToSubscription: clampedMinutesBetween(
          postHog?.firstEventAt ?? null,
          row.firstSubscriptionAt,
        ),
      };
    });

    return { total, rows: merged };
  }

  private activeUsersQuery(periodDays: number, sourceFilter: string): string {
    const dauWindow = Math.min(1, periodDays);
    const wauWindow = Math.min(7, periodDays);
    // Unlike dau/wau, mau is never clamped to a fixed 30-day cap — it scales
    // up to the full picker so 90d reads distinctly from 30d (never wider
    // than periodDays, so this still respects "never exceed the picker").
    const mauWindow = periodDays;
    return `
      SELECT
          uniqIf(person_id, timestamp >= now() - INTERVAL ${dauWindow} DAY) AS dau,
          uniqIf(person_id, timestamp >= now() - INTERVAL ${wauWindow} DAY) AS wau,
          uniqIf(person_id, timestamp >= now() - INTERVAL ${mauWindow} DAY) AS mau
      FROM events
      WHERE timestamp >= now() - INTERVAL ${mauWindow} DAY
        AND event = '$pageview'${sourceFilter}
    `.trim();
  }

  private funnelQuery(periodDays: number, sourceFilter: string): string {
    return `
      SELECT
          uniqIf(person_id, event = '$pageview') AS visited,
          uniqIf(person_id, event = 'subscription_create_started') AS started,
          uniqIf(person_id, event = 'subscription_handoff_opened') AS handoff,
          uniqIf(person_id, event = 'telegram_linked') AS linked,
          uniqIf(person_id, event = 'landing_cta_clicked') AS cta
      FROM events
      WHERE timestamp >= now() - INTERVAL ${periodDays} DAY${sourceFilter}
    `.trim();
  }

  private sourcesQuery(periodDays: number): string {
    return `
      SELECT
          coalesce(nullIf(properties.$referring_domain, ''), 'direct') AS source,
          uniq(person_id) AS people
      FROM events
      WHERE timestamp >= now() - INTERVAL ${periodDays} DAY
        AND event = '$pageview'
      GROUP BY source
      ORDER BY people DESC
      LIMIT 20
    `.trim();
  }

  private peopleSideQuery(personIds: string[]): string {
    const idList = personIds.map((id) => `'${escapeHogql(id)}'`).join(", ");
    return `
      SELECT
          person_id,
          min(timestamp) AS first_event_at,
          max(timestamp) AS last_event_at,
          countIf(event = '$pageview') AS pageviews,
          countIf(event = 'apply_clicked') AS feed_clicks,
          countIf(event = 'digest_link_clicked') AS digest_clicks
      FROM events
      WHERE timestamp >= now() - INTERVAL 180 DAY
        AND person_id IN (${idList})
      GROUP BY person_id
    `.trim();
  }

  private async fetchPostHogPeopleSide(
    personIds: string[],
  ): Promise<Map<string, PostHogPersonSide>> {
    const map = new Map<string, PostHogPersonSide>();
    if (personIds.length === 0) return map;

    const rows = await this.posthogQueryClient.query(this.peopleSideQuery(personIds));
    for (const row of rows ?? []) {
      const personId = toStringOrEmpty(row.person_id);
      if (!personId) continue;
      map.set(personId, {
        firstEventAt: toIsoOrNull(row.first_event_at),
        lastEventAt: toIsoOrNull(row.last_event_at),
        pageviews: toNumber(row.pageviews),
        feedClicks: toNumber(row.feed_clicks),
        digestClicks: toNumber(row.digest_clicks),
      });
    }
    return map;
  }

  // This roster deliberately does not join the product-events ledger.
  private async roster(
    query: AnalyticsPagePeopleQuery,
    limit: number,
    offset: number,
  ): Promise<{ total: number; rows: RosterRow[] }> {
    const search = query.q?.trim().toLowerCase().slice(0, 64) ?? "";
    const orderColumn = this.orderColumn(query.sort);
    const orderDir = query.dir === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`;

    const result = await this.db.execute<{
      id: string | null;
      display_name: string;
      has_account: boolean;
      providers: string[] | null;
      registered_at: string | null;
      subscriptions: number;
      active_subscriptions: number;
      first_subscription_at: string | null;
      telegram_linked: boolean;
      total: number;
    }>(sql`
      WITH people_raw AS (
        SELECT
          u.id,
          true AS has_account,
          u.created_at AS registered_at,
          COALESCE(ip.display_name, NULLIF(u.email, '')) AS display_name
        FROM users u
        LEFT JOIN (
          SELECT
            user_id,
            MAX(NULLIF(trim(concat_ws(' ', first_name, username)), '')) AS display_name
          FROM auth_identities
          GROUP BY user_id
        ) ip ON ip.user_id = u.id
        UNION ALL
        SELECT
          s.person_id AS id,
          false AS has_account,
          NULL::timestamptz AS registered_at,
          COALESCE(
            MAX(NULLIF(trim(s.tg_first_name), '')),
            MAX(NULLIF(trim(s.tg_username), '')),
            MAX(NULLIF(trim(s.name), ''))
          ) AS display_name
        FROM subscriptions s
        GROUP BY s.person_id
      ),
      people AS (
        SELECT
          id,
          bool_or(has_account) AS has_account,
          MIN(registered_at) AS registered_at,
          MAX(display_name) AS display_name
        FROM people_raw
        GROUP BY id
      ),
      providers_by_user AS (
        SELECT user_id AS id, array_agg(DISTINCT provider ORDER BY provider) AS providers
        FROM auth_identities
        GROUP BY user_id
      ),
      subs_by_person AS (
        SELECT
          person_id AS id,
          COUNT(*)::int AS subscriptions,
          COUNT(*) FILTER (WHERE is_active)::int AS active_subscriptions,
          MIN(created_at) AS first_subscription_at,
          bool_or(chat_id IS NOT NULL) AS telegram_linked
        FROM subscriptions
        GROUP BY person_id
      ),
      roster AS (
        SELECT
          p.id,
          COALESCE(p.display_name, 'Unknown person') AS display_name,
          p.has_account,
          COALESCE(pu.providers, ARRAY[]::text[]) AS providers,
          p.registered_at,
          COALESCE(sp.subscriptions, 0)::int AS subscriptions,
          COALESCE(sp.active_subscriptions, 0)::int AS active_subscriptions,
          sp.first_subscription_at,
          COALESCE(sp.telegram_linked, false) AS telegram_linked
        FROM people p
        LEFT JOIN providers_by_user pu ON pu.id = p.id
        LEFT JOIN subs_by_person sp ON sp.id = p.id
      ),
      filtered AS (
        SELECT * FROM roster
        WHERE ${search} = ''
          OR id::text ILIKE ${`%${search}%`}
          OR display_name ILIKE ${`%${search}%`}
      ),
      page AS (
        SELECT * FROM filtered
        ORDER BY ${orderColumn} ${orderDir}, id ASC
        LIMIT ${limit} OFFSET ${offset}
      ),
      total AS (
        SELECT COUNT(*)::int AS total FROM filtered
      )
      SELECT page.*, total.total
      FROM total
      LEFT JOIN page ON true
    `);

    const rows: RosterRow[] = result.rows.flatMap((row) => {
      if (row.id === null) return [];
      return [
        {
          personId: row.id,
          displayName: row.display_name,
          hasAccount: row.has_account,
          providers: row.providers ?? [],
          registeredAt: toIsoOrNull(row.registered_at),
          subscriptions: Number(row.subscriptions),
          activeSubscriptions: Number(row.active_subscriptions),
          firstSubscriptionAt: toIsoOrNull(row.first_subscription_at),
          telegramLinked: row.telegram_linked,
        },
      ];
    });

    return { total: Number(result.rows[0]?.total ?? 0), rows };
  }

  private orderColumn(sort: AnalyticsPagePeopleSort) {
    switch (sort) {
      case "displayName":
        return sql`display_name`;
      case "subscriptions":
        return sql`subscriptions`;
      case "activeSubscriptions":
        return sql`active_subscriptions`;
      case "firstSubscriptionAt":
        return sql`first_subscription_at`;
      case "registeredAt":
      default:
        return sql`registered_at`;
    }
  }
}
