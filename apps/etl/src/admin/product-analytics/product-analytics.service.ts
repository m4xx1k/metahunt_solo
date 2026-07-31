import { Inject, Injectable } from "@nestjs/common";

import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ANALYTICS_EVENTS, USER_ACTION_EVENTS } from "../../platform/analytics/events";
import { asStringArray } from "../../platform/shared/coerce";
import { reportingPeriodSince } from "../../platform/shared/reporting-period";

import { compareChannels, resolveChannelSource } from "./channel-source";
import {
  GROWTH_WINDOW_WEEKS,
  PRODUCT_FUNNEL_STEPS,
  RETENTION_WINDOW_WEEKS,
  type AnalyticsJourneyClassification,
  type CrmPeoplePage,
  type CrmPeopleSort,
  type ProductAnalyticsOverview,
  type ProductAnalyticsPeriod,
  type ProductAnalyticsPopulation,
  type ProductChannel,
  type ProductDeliveryDay,
  type ProductDeliveryHealth,
  type ProductFeedEngagement,
  type ProductGrowth,
  type ProductIdentityHealth,
  type ProductPeriodFlow,
  type ProductRetention,
  type ProductSubscriberStates,
  type RecentProductJourney,
  type SubscriberActivity,
  type SubscriberStatus,
  type SubscriberSubscription,
  type UpdateAnalyticsJourneyDto,
} from "./product-analytics.contract";

const { analyticsJourneys, nodes, productEvents, sentNotifications, subscriptions } = schema;
const CRM_PEOPLE_LIMIT = 50;
const RECENT_JOURNEY_LIMIT = 30;
const SUBSCRIBER_ACTIVITY_LIMIT = 50;
const UNLABELED_TRACK = "усі ролі";
const DAY_MS = 24 * 60 * 60 * 1000;
// Dormant guards against marking a quiet-week narrow-track subscriber
// churned: digests must actually be landing with zero reply.
const DORMANT_WINDOW_DAYS = 14;
const DORMANT_MIN_DIGESTS = 3;
const DELIVERY_DAILY_WINDOW_DAYS = 7;

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// `since` (period) takes precedence; for "all" fall back to the span since
// the earliest scoped event so the ratio isn't divided by an arbitrary unit.
function periodDaysFor(since: Date | null, earliestAt: Date | null): number {
  if (since) return (Date.now() - since.getTime()) / DAY_MS;
  if (!earliestAt) return 0;
  return Math.max((Date.now() - earliestAt.getTime()) / DAY_MS, 1);
}

@Injectable()
export class ProductAnalyticsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async overview(
    period: ProductAnalyticsPeriod,
    population: ProductAnalyticsPopulation = "production",
  ): Promise<ProductAnalyticsOverview> {
    const since = reportingPeriodSince(period);
    const createdPeriod = since ? gte(subscriptions.createdAt, since) : undefined;
    const populationFilter = this.populationFilter(population);

    const [
      funnelChain,
      subscriptionRows,
      identityRows,
      recentJourneys,
      subscriberActivity,
      feedEngagement,
    ] = await Promise.all([
      this.orderedFunnel(since, population),
      this.db
        .select({
          total: count(),
          createdInPeriod: sql<number>`count(*) filter (where ${createdPeriod ?? sql`true`})::int`,
          active: sql<number>`count(*) filter (where ${subscriptions.isActive})::int`,
          pending: sql<number>`count(*) filter (where ${subscriptions.chatId} is null)::int`,
          linked: sql<number>`count(*) filter (where ${subscriptions.chatId} is not null)::int`,
          feed: sql<number>`count(*) filter (where ${subscriptions.candidateId} is null)::int`,
          cv: sql<number>`count(*) filter (where ${subscriptions.candidateId} is not null)::int`,
          deactivated: sql<number>`count(*) filter (where not ${subscriptions.isActive} and ${subscriptions.chatId} is not null)::int`,
          delivered: sql<number>`count(*) filter (where exists (select 1 from ${sentNotifications} sn where sn.subscription_id = ${subscriptions.id}))::int`,
        })
        .from(subscriptions)
        .innerJoin(analyticsJourneys, eq(analyticsJourneys.id, subscriptions.journeyId))
        .where(populationFilter),
      this.identityHealth(population),
      this.recentJourneys(population),
      this.subscriberActivity(population, since),
      this.feedEngagement(since, population),
    ]);

    const [flow, channels, subscriberStates, deliverySummary, deliveryDaily, growth, retention] =
      await Promise.all([
        this.periodFlow(since, population),
        this.channels(since, population),
        this.subscriberStates(population),
        this.deliverySummary(since, population),
        this.deliveryDaily(population),
        this.growth(population),
        this.retention(population),
      ]);

    const subscriptionsRow = subscriptionRows[0];
    const delivered = subscriptionsRow?.delivered ?? 0;
    const linked = subscriptionsRow?.linked ?? 0;

    return {
      generatedAt: new Date(),
      period,
      population,
      growth,
      retention,
      funnel: funnelChain.steps,
      funnelBypass: funnelChain.bypass,
      subscriptions: {
        total: subscriptionsRow?.total ?? 0,
        createdInPeriod: subscriptionsRow?.createdInPeriod ?? 0,
        active: subscriptionsRow?.active ?? 0,
        pending: subscriptionsRow?.pending ?? 0,
        linked,
        feed: subscriptionsRow?.feed ?? 0,
        cv: subscriptionsRow?.cv ?? 0,
        deactivated: subscriptionsRow?.deactivated ?? 0,
        delivered,
        linkedWithoutDelivery: Math.max(linked - delivered, 0),
      },
      flow: { ...flow, joined: subscriptionsRow?.createdInPeriod ?? 0 },
      channels,
      identity: identityRows,
      recentJourneys,
      subscriberActivity,
      feedEngagement,
      subscriberStates,
      delivery: { ...deliverySummary, daily: deliveryDaily, unsubscribed: flow.churned },
    };
  }

  async updateJourney(
    id: string,
    input: UpdateAnalyticsJourneyDto,
  ): Promise<AnalyticsJourneyClassification | null> {
    const cohortId = input.cohortId === undefined ? undefined : input.cohortId?.trim() || null;
    const [updated] = await this.db
      .update(analyticsJourneys)
      .set({
        isTest: input.isTest,
        ...(cohortId === undefined ? {} : { cohortId }),
      })
      .where(eq(analyticsJourneys.id, id))
      .returning({
        id: analyticsJourneys.id,
        isTest: analyticsJourneys.isTest,
        cohortId: analyticsJourneys.cohortId,
      });
    return updated ?? null;
  }

  async people(
    period: ProductAnalyticsPeriod,
    input: {
      q?: string;
      sort: CrmPeopleSort;
      offset: number;
      limit?: number;
      from?: Date;
      to?: Date;
    },
  ): Promise<CrmPeoplePage> {
    const since = input.from ?? reportingPeriodSince(period);
    const until = input.to ?? null;
    const limit = Math.min(input.limit ?? CRM_PEOPLE_LIMIT, CRM_PEOPLE_LIMIT);
    const offset = Math.max(input.offset, 0);
    const query = input.q?.trim().toLowerCase().slice(0, 64) ?? "";
    const orderBy =
      input.sort === "first_known"
        ? sql`first_known_at ASC, id ASC`
        : input.sort === "clicks"
          ? sql`(feed_clicks + telegram_clicks) DESC, id ASC`
          : input.sort === "at_risk"
            ? sql`(state = 'at_risk') DESC, last_product_action_at DESC NULLS LAST, id ASC`
            : sql`last_product_action_at DESC NULLS LAST, id ASC`;
    const userActions = sql.join(
      USER_ACTION_EVENTS.map((name) => sql`${name}`),
      sql`, `,
    );
    const result = await this.db.execute<{
      id: string | null;
      display_name: string | null;
      has_account: boolean;
      has_telegram: boolean;
      first_known_at: Date | string;
      last_product_action_at: Date | string | null;
      subscriptions: number;
      feed_clicks: number;
      telegram_clicks: number;
      state: "active" | "at_risk" | "no_subscription";
      total: number;
      known_people: number;
      telegram_connected: number;
      job_clickers: number;
      at_risk: number;
    }>(sql`
      WITH people_raw AS (
        SELECT
          u.id,
          true AS has_account,
          false AS has_telegram,
          u.created_at AS first_known_at,
          COALESCE(
            ip.display_name,
            NULLIF(u.email, '')
          ) AS display_name
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
          bool_or(s.chat_id IS NOT NULL) AS has_telegram,
          MIN(s.created_at) AS first_known_at,
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
          bool_or(has_telegram) AS has_telegram,
          MIN(first_known_at) AS first_known_at,
          MAX(display_name) AS display_name
        FROM people_raw
        GROUP BY id
      ),
      activity AS (
        SELECT
          j.person_id AS id,
          MAX(e.occurred_at) FILTER (WHERE e.name IN (${userActions})) AS last_product_action_at,
          COUNT(*) FILTER (
            WHERE e.name = ${ANALYTICS_EVENTS.applyClicked}
              AND e.occurred_at >= COALESCE(${since}, '-infinity'::timestamptz)
              AND e.occurred_at < COALESCE(${until}, 'infinity'::timestamptz)
          )::int AS feed_clicks,
          COUNT(*) FILTER (
            WHERE e.name = ${ANALYTICS_EVENTS.digestLinkClicked}
              AND e.occurred_at >= COALESCE(${since}, '-infinity'::timestamptz)
              AND e.occurred_at < COALESCE(${until}, 'infinity'::timestamptz)
          )::int AS telegram_clicks
        FROM analytics_journeys j
        LEFT JOIN product_events e ON e.journey_id = j.id
        GROUP BY j.person_id
      ),
      subscriptions_by_person AS (
        SELECT person_id AS id, COUNT(*)::int AS subscriptions, bool_or(is_active) AS has_active_subscription
        FROM subscriptions
        GROUP BY person_id
      ),
      roster AS (
        SELECT
          p.id, COALESCE(MAX(p.display_name), 'Unknown person') AS display_name,
          bool_or(p.has_account) AS has_account,
          bool_or(p.has_telegram) AS has_telegram,
          MIN(p.first_known_at) AS first_known_at,
          a.last_product_action_at,
          COALESCE(s.subscriptions, 0)::int AS subscriptions,
          COALESCE(a.feed_clicks, 0)::int AS feed_clicks,
          COALESCE(a.telegram_clicks, 0)::int AS telegram_clicks,
          CASE
            WHEN COALESCE(s.subscriptions, 0) = 0 THEN 'no_subscription'
            WHEN NOT COALESCE(s.has_active_subscription, false)
              OR a.last_product_action_at IS NULL
              OR (${since}::timestamptz IS NOT NULL AND a.last_product_action_at < ${since}) THEN 'at_risk'
            ELSE 'active'
          END AS state
        FROM people p
        LEFT JOIN activity a ON a.id = p.id
        LEFT JOIN subscriptions_by_person s ON s.id = p.id
      ),
      filtered AS (
        SELECT * FROM roster
        WHERE ${query} = ''
          OR id::text ILIKE ${`%${query}%`}
          OR display_name ILIKE ${`%${query}%`}
      ),
      metrics AS (
        SELECT
          COUNT(*)::int AS known_people,
          COUNT(*) FILTER (WHERE has_telegram)::int AS telegram_connected,
          COUNT(*) FILTER (WHERE feed_clicks + telegram_clicks > 0)::int AS job_clickers,
          COUNT(*) FILTER (WHERE state = 'at_risk')::int AS at_risk
        FROM roster
      ),
      page AS (
        SELECT filtered.*, COUNT(*) OVER()::int AS total
        FROM filtered
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT page.*, metrics.*
      FROM metrics
      LEFT JOIN page ON true
      ORDER BY ${orderBy}
    `);
    const first = result.rows[0];
    return {
      metrics: {
        knownPeople: Number(first?.known_people ?? 0),
        telegramConnected: Number(first?.telegram_connected ?? 0),
        jobClickers: Number(first?.job_clickers ?? 0),
        atRisk: Number(first?.at_risk ?? 0),
      },
      rows: result.rows
        .filter((row): row is typeof row & { id: string } => row.id !== null)
        .map((row) => ({
          id: row.id,
          displayName: row.display_name ?? "Unknown person",
          hasAccount: row.has_account,
          hasTelegram: row.has_telegram,
          firstKnownAt: new Date(row.first_known_at),
          lastProductActionAt: row.last_product_action_at
            ? new Date(row.last_product_action_at)
            : null,
          subscriptions: Number(row.subscriptions),
          feedClicks: Number(row.feed_clicks),
          telegramClicks: Number(row.telegram_clicks),
          state: row.state,
        })),
      total: Number(first?.total ?? 0),
      offset,
      limit,
    };
  }

  // Ordered chain anchored at landing_view: a journey counts at step N only if
  // it also has every earlier step, so rows are monotonic by construction and
  // "% of landing" is a real conversion. Journeys that subscribe without ever
  // landing (feed, warm lens) are reported separately as `bypass`.
  private async orderedFunnel(since: Date | null, population: ProductAnalyticsPopulation) {
    const stepFlags = PRODUCT_FUNNEL_STEPS.map(
      (name, index) => sql`bool_or(event.name = ${name}) AS ${sql.raw(`step_${index}`)}`,
    );
    const chainCounts = PRODUCT_FUNNEL_STEPS.map((_, index) => {
      const required = sql.join(
        PRODUCT_FUNNEL_STEPS.slice(0, index + 1).map((__, i) => sql.raw(`step_${i}`)),
        sql` AND `,
      );
      return sql`COUNT(*) FILTER (WHERE ${required})::int AS ${sql.raw(`journeys_${index}`)}`;
    });
    const eventCounts = PRODUCT_FUNNEL_STEPS.map(
      (_, index) => sql`SUM(${sql.raw(`events_${index}`)})::int AS ${sql.raw(`events_${index}`)}`,
    );
    const eventFlags = PRODUCT_FUNNEL_STEPS.map(
      (name, index) =>
        sql`COUNT(*) FILTER (WHERE event.name = ${name})::int AS ${sql.raw(`events_${index}`)}`,
    );

    const result = await this.db.execute<Record<string, number>>(sql`
      WITH cohort AS (
        SELECT id
        FROM analytics_journeys
        WHERE (${since}::timestamptz IS NULL OR created_at >= ${since})
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT is_test)
            OR (${population} = 'test' AND is_test)
          )
      ),
      journey_steps AS (
        SELECT
          event.journey_id,
          ${sql.join(stepFlags, sql`, `)},
          ${sql.join(eventFlags, sql`, `)}
        FROM product_events event
        JOIN cohort ON cohort.id = event.journey_id
        WHERE event.name IN (${sql.join(
          PRODUCT_FUNNEL_STEPS.map((name) => sql`${name}`),
          sql`, `,
        )})
        GROUP BY event.journey_id
      )
      SELECT
        ${sql.join(chainCounts, sql`, `)},
        ${sql.join(eventCounts, sql`, `)},
        COUNT(*) FILTER (WHERE NOT step_0)::int AS bypass
      FROM journey_steps
    `);
    const row = result.rows[0] ?? {};
    return {
      steps: PRODUCT_FUNNEL_STEPS.map((name, index) => ({
        name,
        events: Number(row[`events_${index}`] ?? 0),
        journeys: Number(row[`journeys_${index}`] ?? 0),
      })),
      bypass: Number(row.bypass ?? 0),
    };
  }

  // Feed clicks (#103) aren't part of the linear subscribe→digest chain — a
  // visitor can tap a feed vacancy without ever subscribing — so this is a
  // standalone KPI rather than another PRODUCT_FUNNEL_STEPS bar.
  private async feedEngagement(
    since: Date | null,
    population: ProductAnalyticsPopulation,
  ): Promise<ProductFeedEngagement> {
    const result = await this.db.execute<{ journeys: number; events: number }>(sql`
      SELECT
        COUNT(DISTINCT event.journey_id)::int AS journeys,
        COUNT(event.id)::int AS events
      FROM product_events event
      JOIN analytics_journeys journey ON journey.id = event.journey_id
      WHERE event.name = ${ANALYTICS_EVENTS.applyClicked}
        AND (${since}::timestamptz IS NULL OR journey.created_at >= ${since})
        AND (
          ${population} = 'all'
          OR (${population} = 'production' AND NOT journey.is_test)
          OR (${population} = 'test' AND journey.is_test)
        )
    `);
    const row = result.rows[0];
    return { journeys: Number(row?.journeys ?? 0), events: Number(row?.events ?? 0) };
  }

  // Movement inside the window, counted from the ledger rather than from
  // subscription state: `activated`/`churned` are events, so a chat that linked
  // and left in the same window shows up in both.
  private async periodFlow(
    since: Date | null,
    population: ProductAnalyticsPopulation,
  ): Promise<Omit<ProductPeriodFlow, "joined">> {
    const result = await this.db.execute<{
      activated: number;
      digest_clicks: number;
      feed_clicks: number;
      churned: number;
    }>(sql`
      SELECT
        COUNT(DISTINCT event.subscription_id) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.telegramLinked})::int AS activated,
        COUNT(*) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.digestLinkClicked})::int AS digest_clicks,
        COUNT(*) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.applyClicked})::int AS feed_clicks,
        COUNT(*) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.unsubscribed})::int AS churned
      FROM product_events event
      JOIN analytics_journeys journey ON journey.id = event.journey_id
      WHERE (${since}::timestamptz IS NULL OR event.occurred_at >= ${since})
        AND (
          ${population} = 'all'
          OR (${population} = 'production' AND NOT journey.is_test)
          OR (${population} = 'test' AND journey.is_test)
        )
    `);
    const row = result.rows[0];
    return {
      activated: Number(row?.activated ?? 0),
      digestClicks: Number(row?.digest_clicks ?? 0),
      feedClicks: Number(row?.feed_clicks ?? 0),
      churned: Number(row?.churned ?? 0),
    };
  }

  // Lifecycle STATE per chat_id, all-time (not period-scoped): churned = every
  // linked subscription deactivated; dormant = active but ≥3 digests landed in
  // 14d with zero USER_ACTION_EVENTS in reply; active = the rest. Digests are
  // matched to the chat's own subscriptions (never a shared journey's), so a
  // narrow track's silence can't be padded by a sibling subscription's clicks.
  private async subscriberStates(
    population: ProductAnalyticsPopulation,
  ): Promise<ProductSubscriberStates> {
    const dormantSince = new Date(Date.now() - DORMANT_WINDOW_DAYS * DAY_MS);
    const userActionNames = sql.join(
      USER_ACTION_EVENTS.map((name) => sql`${name}`),
      sql`, `,
    );
    const result = await this.db.execute<{ active: number; dormant: number; churned: number }>(sql`
      WITH chat_subs AS (
        SELECT s.chat_id, s.id AS subscription_id, s.journey_id, s.is_active
        FROM subscriptions s
        JOIN analytics_journeys j ON j.id = s.journey_id
        WHERE s.chat_id IS NOT NULL
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT j.is_test)
            OR (${population} = 'test' AND j.is_test)
          )
      ),
      chat_state AS (
        SELECT chat_id, bool_or(is_active) AS has_active
        FROM chat_subs
        GROUP BY chat_id
      ),
      recent_digests AS (
        SELECT cs.chat_id, COUNT(*)::int AS digests
        FROM product_events e
        JOIN chat_subs cs ON cs.subscription_id = e.subscription_id
        WHERE e.name = ${ANALYTICS_EVENTS.digestSent}
          AND e.occurred_at >= ${dormantSince}
        GROUP BY cs.chat_id
      ),
      recent_actions AS (
        SELECT DISTINCT cs.chat_id
        FROM product_events e
        JOIN chat_subs cs ON cs.journey_id = e.journey_id
        WHERE e.name IN (${userActionNames})
          AND e.occurred_at >= ${dormantSince}
      )
      SELECT
        COUNT(*) FILTER (
          WHERE cs2.has_active
            AND NOT (COALESCE(rd.digests, 0) >= ${DORMANT_MIN_DIGESTS} AND ra.chat_id IS NULL)
        )::int AS active,
        COUNT(*) FILTER (
          WHERE cs2.has_active
            AND COALESCE(rd.digests, 0) >= ${DORMANT_MIN_DIGESTS}
            AND ra.chat_id IS NULL
        )::int AS dormant,
        COUNT(*) FILTER (WHERE NOT cs2.has_active)::int AS churned
      FROM chat_state cs2
      LEFT JOIN recent_digests rd ON rd.chat_id = cs2.chat_id
      LEFT JOIN recent_actions ra ON ra.chat_id = cs2.chat_id
    `);
    const row = result.rows[0];
    return {
      active: Number(row?.active ?? 0),
      dormant: Number(row?.dormant ?? 0),
      churned: Number(row?.churned ?? 0),
    };
  }

  // Chats that reached a linked state, keyed by the FIRST link. Anchored on
  // `subscriptions.linked_at` rather than the `telegram_linked` event: the
  // event ledger only exists since analytics shipped, so the event would
  // silently drop every older subscriber out of both growth and retention.
  private linkedChatsCte(population: ProductAnalyticsPopulation) {
    return sql`
      SELECT s.chat_id, MIN(s.linked_at) AS anchor_at
      FROM subscriptions s
      JOIN analytics_journeys j ON j.id = s.journey_id
      WHERE s.chat_id IS NOT NULL
        AND s.linked_at IS NOT NULL
        AND (
          ${population} = 'all'
          OR (${population} = 'production' AND NOT j.is_test)
          OR (${population} = 'test' AND j.is_test)
        )
      GROUP BY s.chat_id
    `;
  }

  // The north star: newly linked chats per ISO week (Postgres weeks start
  // Monday). Buckets are generated so a zero week reads as a zero, not a gap.
  private async growth(population: ProductAnalyticsPopulation): Promise<ProductGrowth> {
    const result = await this.db.execute<{
      week_start: string;
      linked: number;
      cumulative: number;
      total_linked: number;
    }>(sql`
      WITH linked_chats AS (${this.linkedChatsCte(population)}),
      buckets AS (
        SELECT (date_trunc('week', now()) - (week_offset::text || ' weeks')::interval)::date AS week_start
        FROM generate_series(0, ${GROWTH_WINDOW_WEEKS - 1}) AS week_offset
      ),
      per_week AS (
        SELECT date_trunc('week', anchor_at)::date AS week_start, COUNT(*)::int AS linked
        FROM linked_chats
        GROUP BY 1
      )
      SELECT
        to_char(buckets.week_start, 'YYYY-MM-DD') AS week_start,
        COALESCE(per_week.linked, 0)::int AS linked,
        (
          SELECT COUNT(*)
          FROM linked_chats lc
          WHERE lc.anchor_at < buckets.week_start + interval '7 days'
        )::int AS cumulative,
        (SELECT COUNT(*) FROM linked_chats)::int AS total_linked
      FROM buckets
      LEFT JOIN per_week ON per_week.week_start = buckets.week_start
      ORDER BY buckets.week_start
    `);

    const weeks = result.rows.map((row) => ({
      weekStart: row.week_start,
      linked: Number(row.linked),
      cumulative: Number(row.cumulative),
    }));
    return {
      weeks,
      current: weeks.at(-1)?.linked ?? 0,
      previous: weeks.at(-2)?.linked ?? 0,
      totalLinked: Number(result.rows[0]?.total_linked ?? 0),
    };
  }

  // Weekly cohorts of linked chats vs. whether they acted again. The action
  // join goes through journey OR subscription, matching how `lastActionAt` is
  // resolved — otherwise a digest tap and a landing visit land in different
  // cohorts for the same person.
  private async retention(population: ProductAnalyticsPopulation): Promise<ProductRetention> {
    const userActionNames = sql.join(
      USER_ACTION_EVENTS.map((name) => sql`${name}`),
      sql`, `,
    );
    const returnedColumns = Array.from(
      { length: RETENTION_WINDOW_WEEKS },
      (_, offset) =>
        sql`COUNT(DISTINCT o.chat_id) FILTER (WHERE o.week_offset = ${offset})::int AS ${sql.raw(
          `returned_${offset}`,
        )}`,
    );

    const result = await this.db.execute<Record<string, string | number>>(sql`
      WITH linked_chats AS (${this.linkedChatsCte(population)}),
      cohorts AS (
        SELECT chat_id, anchor_at, date_trunc('week', anchor_at)::date AS week_start
        FROM linked_chats
        WHERE anchor_at >= date_trunc('week', now()) - (${RETENTION_WINDOW_WEEKS - 1}::text || ' weeks')::interval
      ),
      chat_subs AS (
        SELECT s.chat_id, s.id AS subscription_id, s.journey_id
        FROM subscriptions s
        WHERE s.chat_id IN (SELECT chat_id FROM cohorts)
      ),
      actions AS (
        SELECT DISTINCT cs.chat_id, e.occurred_at
        FROM product_events e
        JOIN chat_subs cs
          ON cs.journey_id = e.journey_id
          OR cs.subscription_id = e.subscription_id
        WHERE e.name IN (${userActionNames})
      ),
      offsets AS (
        SELECT
          c.chat_id,
          FLOOR(EXTRACT(EPOCH FROM (a.occurred_at - c.anchor_at)) / 604800)::int AS week_offset
        FROM cohorts c
        JOIN actions a ON a.chat_id = c.chat_id
        WHERE a.occurred_at >= c.anchor_at
      )
      SELECT
        to_char(c.week_start, 'YYYY-MM-DD') AS week_start,
        COUNT(DISTINCT c.chat_id)::int AS size,
        ${sql.join(returnedColumns, sql`, `)}
      FROM cohorts c
      LEFT JOIN offsets o ON o.chat_id = c.chat_id
      GROUP BY c.week_start
      ORDER BY c.week_start
    `);

    return {
      windowWeeks: RETENTION_WINDOW_WEEKS,
      cohorts: result.rows.map((row) => ({
        weekStart: String(row.week_start),
        size: Number(row.size),
        returned: Array.from({ length: RETENTION_WINDOW_WEEKS }, (_, offset) =>
          Number(row[`returned_${offset}`] ?? 0),
        ),
      })),
    };
  }

  // System health (our pipeline, not user behavior): what got sent and what
  // failed, period-scoped. `messagesPerChatPerDay` is the churn-risk number —
  // "all" falls back to the span since the earliest scoped digest.
  private async deliverySummary(
    since: Date | null,
    population: ProductAnalyticsPopulation,
  ): Promise<Omit<ProductDeliveryHealth, "daily" | "unsubscribed">> {
    const result = await this.db.execute<{
      digests_sent: number;
      chats_reached: number;
      earliest_at: string | null;
      chat_unreachable: number;
      transient: number;
    }>(sql`
      WITH digests AS (
        SELECT e.occurred_at, s.chat_id
        FROM product_events e
        JOIN subscriptions s ON s.id = e.subscription_id
        JOIN analytics_journeys j ON j.id = e.journey_id
        WHERE e.name = ${ANALYTICS_EVENTS.digestSent}
          AND (${since}::timestamptz IS NULL OR e.occurred_at >= ${since})
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT j.is_test)
            OR (${population} = 'test' AND j.is_test)
          )
      ),
      failures AS (
        SELECT e.properties
        FROM product_events e
        JOIN analytics_journeys j ON j.id = e.journey_id
        WHERE e.name = ${ANALYTICS_EVENTS.digestDeliveryFailed}
          AND (${since}::timestamptz IS NULL OR e.occurred_at >= ${since})
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT j.is_test)
            OR (${population} = 'test' AND j.is_test)
          )
      )
      SELECT
        (SELECT COUNT(*) FROM digests)::int AS digests_sent,
        (SELECT COUNT(DISTINCT chat_id) FROM digests)::int AS chats_reached,
        (SELECT MIN(occurred_at) FROM digests) AS earliest_at,
        (SELECT COUNT(*) FROM failures WHERE properties->>'failure_kind' = 'chat_unreachable')::int AS chat_unreachable,
        (SELECT COUNT(*) FROM failures WHERE properties->>'failure_kind' = 'transient')::int AS transient
    `);
    const row = result.rows[0];
    const digestsSent = Number(row?.digests_sent ?? 0);
    const chatsReached = Number(row?.chats_reached ?? 0);
    const earliestAt = row?.earliest_at ? new Date(row.earliest_at) : null;
    const days = periodDaysFor(since, earliestAt);
    return {
      digestsSent,
      chatsReached,
      messagesPerChatPerDay: chatsReached > 0 && days > 0 ? digestsSent / (chatsReached * days) : 0,
      failures: {
        chatUnreachable: Number(row?.chat_unreachable ?? 0),
        transient: Number(row?.transient ?? 0),
      },
    };
  }

  // Fixed 7-day drill-down for the Delivery panel, independent of the page's
  // period selector — a supplementary trend, not the headline number.
  private async deliveryDaily(
    population: ProductAnalyticsPopulation,
  ): Promise<ProductDeliveryDay[]> {
    const result = await this.db.execute<{
      date: string;
      digests: number;
      chats: number;
      failures: number;
    }>(sql`
      WITH buckets AS (
        SELECT (date_trunc('day', now()) - (day_offset::text || ' days')::interval)::date AS day
        FROM generate_series(0, ${DELIVERY_DAILY_WINDOW_DAYS - 1}) AS day_offset
      ),
      digests AS (
        SELECT date_trunc('day', e.occurred_at)::date AS day, s.chat_id
        FROM product_events e
        JOIN subscriptions s ON s.id = e.subscription_id
        JOIN analytics_journeys j ON j.id = e.journey_id
        WHERE e.name = ${ANALYTICS_EVENTS.digestSent}
          AND e.occurred_at >= now() - (${DELIVERY_DAILY_WINDOW_DAYS}::text || ' days')::interval
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT j.is_test)
            OR (${population} = 'test' AND j.is_test)
          )
      ),
      digest_counts AS (
        SELECT day, COUNT(*)::int AS digests, COUNT(DISTINCT chat_id)::int AS chats
        FROM digests
        GROUP BY day
      ),
      failures AS (
        SELECT date_trunc('day', e.occurred_at)::date AS day, COUNT(*)::int AS failures
        FROM product_events e
        JOIN analytics_journeys j ON j.id = e.journey_id
        WHERE e.name = ${ANALYTICS_EVENTS.digestDeliveryFailed}
          AND e.occurred_at >= now() - (${DELIVERY_DAILY_WINDOW_DAYS}::text || ' days')::interval
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT j.is_test)
            OR (${population} = 'test' AND j.is_test)
          )
        GROUP BY day
      )
      SELECT
        to_char(buckets.day, 'YYYY-MM-DD') AS date,
        COALESCE(digest_counts.digests, 0)::int AS digests,
        COALESCE(digest_counts.chats, 0)::int AS chats,
        COALESCE(failures.failures, 0)::int AS failures
      FROM buckets
      LEFT JOIN digest_counts ON digest_counts.day = buckets.day
      LEFT JOIN failures ON failures.day = buckets.day
      ORDER BY buckets.day
    `);
    return result.rows.map((row) => {
      const digests = Number(row.digests);
      const chats = Number(row.chats);
      return {
        date: row.date,
        digests,
        chats,
        perChat: chats > 0 ? digests / chats : 0,
        failures: Number(row.failures),
      };
    });
  }

  // First-touch attribution: a journey's channel comes from the utm_source on
  // its earliest landing event, falling back to that landing's referrer for the
  // untagged third of arrivals. SQL groups by the raw pair; `resolveChannelSource`
  // then folds domains into channels in TS, so several referrers (threads.com,
  // threads.net, an in-app package name) collapse into one row. The period
  // filters on the landing, not on journey creation — "who arrived in this
  // window".
  private async channels(
    since: Date | null,
    population: ProductAnalyticsPopulation,
  ): Promise<ProductChannel[]> {
    const result = await this.db.execute<{
      source: string | null;
      campaign: string | null;
      referrer_domain: string | null;
      landed: number;
      subscribed: number;
      activated: number;
      digest_clicks: number;
    }>(sql`
      WITH first_touch AS (
        SELECT
          event.journey_id,
          (ARRAY_AGG(NULLIF(event.properties->>'utm_source', '') ORDER BY event.occurred_at))[1] AS source,
          (ARRAY_AGG(NULLIF(event.properties->>'utm_campaign', '') ORDER BY event.occurred_at))[1] AS campaign,
          (ARRAY_AGG(NULLIF(event.properties->>'referrer_domain', '') ORDER BY event.occurred_at))[1] AS referrer_domain,
          MIN(event.occurred_at) AS landed_at
        FROM product_events event
        WHERE event.name IN (${ANALYTICS_EVENTS.landingView}, ${ANALYTICS_EVENTS.landingCtaClicked})
        GROUP BY event.journey_id
      ),
      scoped AS (
        SELECT
          first_touch.journey_id,
          first_touch.source,
          first_touch.campaign,
          first_touch.referrer_domain
        FROM first_touch
        JOIN analytics_journeys journey ON journey.id = first_touch.journey_id
        WHERE (${since}::timestamptz IS NULL OR first_touch.landed_at >= ${since})
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT journey.is_test)
            OR (${population} = 'test' AND journey.is_test)
          )
      ),
      per_journey AS (
        SELECT
          scoped.source,
          scoped.campaign,
          scoped.referrer_domain,
          scoped.journey_id,
          COUNT(*) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.subscriptionCreated}) > 0 AS subscribed,
          COUNT(*) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.telegramLinked}) > 0 AS activated,
          COUNT(*) FILTER (WHERE event.name = ${ANALYTICS_EVENTS.digestLinkClicked})::int AS digest_clicks
        FROM scoped
        LEFT JOIN product_events event ON event.journey_id = scoped.journey_id
        GROUP BY scoped.source, scoped.campaign, scoped.referrer_domain, scoped.journey_id
      )
      SELECT
        source,
        campaign,
        referrer_domain,
        COUNT(*)::int AS landed,
        COUNT(*) FILTER (WHERE subscribed)::int AS subscribed,
        COUNT(*) FILTER (WHERE activated)::int AS activated,
        COALESCE(SUM(digest_clicks), 0)::int AS digest_clicks
      FROM per_journey
      GROUP BY source, campaign, referrer_domain
    `);

    const merged = new Map<string, ProductChannel>();
    for (const row of result.rows) {
      const channel = resolveChannelSource(row.source, row.referrer_domain);
      const key = `${channel}|${row.campaign ?? ""}`;
      const existing = merged.get(key);
      const next: ProductChannel = existing ?? {
        source: channel,
        campaign: row.campaign,
        landed: 0,
        subscribed: 0,
        activated: 0,
        digestClicks: 0,
      };
      next.landed += Number(row.landed);
      next.subscribed += Number(row.subscribed);
      next.activated += Number(row.activated);
      next.digestClicks += Number(row.digest_clicks);
      merged.set(key, next);
    }

    return [...merged.values()].sort(compareChannels);
  }

  private async identityHealth(
    population: ProductAnalyticsPopulation,
  ): Promise<ProductIdentityHealth> {
    const result = await this.db.execute<{
      journeys_total: string;
      browser_journeys: string;
      server_journeys: string;
      legacy_journeys: string;
      account_linked_journeys: string;
      multi_journey_users: string;
      subscriptions_without_journey: string;
      tracked_linked_without_event: string;
      tracked_delivery_without_event: string;
      multi_subscription_journeys: string;
      pending_outbox_events: string;
    }>(sql`
      WITH selected_journeys AS (
        SELECT id, origin
        FROM analytics_journeys
        WHERE ${population} = 'all'
          OR (${population} = 'production' AND NOT is_test)
          OR (${population} = 'test' AND is_test)
      )
      SELECT
        (SELECT COUNT(*) FROM selected_journeys)::text AS journeys_total,
        (SELECT COUNT(*) FROM selected_journeys WHERE origin = 'browser')::text AS browser_journeys,
        (SELECT COUNT(*) FROM selected_journeys WHERE origin = 'server')::text AS server_journeys,
        (SELECT COUNT(*) FROM selected_journeys WHERE origin = 'legacy_subscription')::text AS legacy_journeys,
        (
          SELECT COUNT(DISTINCT s.journey_id)
          FROM subscriptions s
          JOIN selected_journeys j ON j.id = s.journey_id
          WHERE s.user_id IS NOT NULL
        )::text AS account_linked_journeys,
        (
          SELECT COUNT(*) FROM (
            SELECT s.user_id
            FROM subscriptions s
            JOIN selected_journeys j ON j.id = s.journey_id
            WHERE s.user_id IS NOT NULL
            GROUP BY s.user_id HAVING COUNT(DISTINCT s.journey_id) > 1
          ) grouped
        )::text AS multi_journey_users,
        (
          SELECT CASE WHEN ${population} = 'test' THEN 0 ELSE COUNT(*) END
          FROM subscriptions WHERE journey_id IS NULL
        )::text AS subscriptions_without_journey,
        (
          SELECT COUNT(*)
          FROM subscriptions s
          JOIN selected_journeys j ON j.id = s.journey_id
          WHERE j.origin <> 'legacy_subscription'
            AND s.chat_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM product_events e
              WHERE e.subscription_id = s.id AND e.name = ${ANALYTICS_EVENTS.telegramLinked}
            )
            AND NOT EXISTS (
              SELECT 1 FROM analytics_outbox o
              WHERE o.subscription_id = s.id AND o.name = ${ANALYTICS_EVENTS.telegramLinked}
            )
        )::text AS tracked_linked_without_event,
        (
          SELECT COUNT(*)
          FROM subscriptions s
          JOIN selected_journeys j ON j.id = s.journey_id
          WHERE j.origin <> 'legacy_subscription'
            AND EXISTS (SELECT 1 FROM sent_notifications sn WHERE sn.subscription_id = s.id)
            AND NOT EXISTS (
              SELECT 1 FROM product_events e
              WHERE e.subscription_id = s.id AND e.name = ${ANALYTICS_EVENTS.digestSent}
            )
            AND NOT EXISTS (
              SELECT 1 FROM analytics_outbox o
              WHERE o.subscription_id = s.id AND o.name = ${ANALYTICS_EVENTS.digestSent}
            )
            AND NOT EXISTS (
              SELECT 1 FROM digest_deliveries d
              WHERE d.subscription_id = s.id AND d.status = 'pending'
            )
        )::text AS tracked_delivery_without_event,
        (
          SELECT COUNT(*) FROM (
            SELECT s.journey_id
            FROM subscriptions s
            JOIN selected_journeys j ON j.id = s.journey_id
            GROUP BY s.journey_id HAVING COUNT(*) > 1
          ) grouped
        )::text AS multi_subscription_journeys,
        (
          SELECT COUNT(*)
          FROM analytics_outbox o
          JOIN selected_journeys j ON j.id = o.journey_id
          WHERE o.processed_at IS NULL
        )::text AS pending_outbox_events
    `);
    const row = result.rows[0];
    return {
      journeysTotal: Number(row?.journeys_total ?? 0),
      browserJourneys: Number(row?.browser_journeys ?? 0),
      serverJourneys: Number(row?.server_journeys ?? 0),
      legacyJourneys: Number(row?.legacy_journeys ?? 0),
      accountLinkedJourneys: Number(row?.account_linked_journeys ?? 0),
      multiJourneyUsers: Number(row?.multi_journey_users ?? 0),
      subscriptionsWithoutJourney: Number(row?.subscriptions_without_journey ?? 0),
      trackedLinkedWithoutEvent: Number(row?.tracked_linked_without_event ?? 0),
      trackedDeliveryWithoutEvent: Number(row?.tracked_delivery_without_event ?? 0),
      multiSubscriptionJourneys: Number(row?.multi_subscription_journeys ?? 0),
      pendingOutboxEvents: Number(row?.pending_outbox_events ?? 0),
    };
  }

  private async recentJourneys(
    population: ProductAnalyticsPopulation,
  ): Promise<RecentProductJourney[]> {
    const journeys = await this.db
      .select({
        id: analyticsJourneys.id,
        origin: analyticsJourneys.origin,
        isTest: analyticsJourneys.isTest,
        cohortId: analyticsJourneys.cohortId,
        createdAt: analyticsJourneys.createdAt,
        lastSeenAt: analyticsJourneys.lastSeenAt,
      })
      .from(analyticsJourneys)
      .where(this.populationFilter(population))
      .orderBy(desc(analyticsJourneys.lastSeenAt))
      .limit(RECENT_JOURNEY_LIMIT);
    const ids = journeys.map(({ id }) => id);
    if (ids.length === 0) return [];

    const [subscriptionRows, eventRows] = await Promise.all([
      this.db
        .select({
          journeyId: subscriptions.journeyId,
          subscriptions: count(),
          active: sql<number>`count(*) filter (where ${subscriptions.isActive})::int`,
          linked: sql<number>`count(*) filter (where ${subscriptions.chatId} is not null)::int`,
          delivered: sql<number>`count(*) filter (where exists (select 1 from ${sentNotifications} sn where sn.subscription_id = ${subscriptions.id}))::int`,
        })
        .from(subscriptions)
        .where(inArray(subscriptions.journeyId, ids))
        .groupBy(subscriptions.journeyId),
      this.db
        .select({
          journeyId: productEvents.journeyId,
          events: count(),
          eventNames: sql<
            string[]
          >`array_agg(distinct ${productEvents.name} order by ${productEvents.name})`,
          lastEventAt: sql<Date>`max(${productEvents.occurredAt})`,
        })
        .from(productEvents)
        .where(inArray(productEvents.journeyId, ids))
        .groupBy(productEvents.journeyId),
    ]);

    return journeys.map((journey) => {
      const subscription = subscriptionRows.find((row) => row.journeyId === journey.id);
      const event = eventRows.find((row) => row.journeyId === journey.id);
      return {
        ...journey,
        subscriptions: subscription?.subscriptions ?? 0,
        activeSubscriptions: subscription?.active ?? 0,
        linkedSubscriptions: subscription?.linked ?? 0,
        deliveredSubscriptions: subscription?.delivered ?? 0,
        events: event?.events ?? 0,
        eventNames: event?.eventNames ?? [],
        lastEventAt: event?.lastEventAt ?? null,
      };
    });
  }

  // Per-chat_id funnel view: every linked subscriber's first signal, landing
  // CTA, telegram_linked event (falling back to the subscription's own
  // `linked_at` for pre-instrumentation links), and their subscriptions with a
  // role-derived track label. Mirrors recentJourneys' batch-then-merge shape
  // rather than one mega-join, since a subscriber can span several journeys.
  private async subscriberActivity(
    population: ProductAnalyticsPopulation,
    since: Date | null,
  ): Promise<SubscriberActivity[]> {
    const populationFilter = this.populationFilter(population);
    const subs = await this.db
      .select({
        id: subscriptions.id,
        chatId: subscriptions.chatId,
        tgUsername: subscriptions.tgUsername,
        tgFirstName: subscriptions.tgFirstName,
        candidateId: subscriptions.candidateId,
        isActive: subscriptions.isActive,
        deactivatedReason: subscriptions.deactivatedReason,
        createdAt: subscriptions.createdAt,
        linkedAt: subscriptions.linkedAt,
        journeyId: subscriptions.journeyId,
        params: subscriptions.params,
      })
      .from(subscriptions)
      .innerJoin(analyticsJourneys, eq(analyticsJourneys.id, subscriptions.journeyId))
      .where(
        populationFilter
          ? and(isNotNull(subscriptions.chatId), populationFilter)
          : isNotNull(subscriptions.chatId),
      );
    if (subs.length === 0) return [];

    const journeyIds = [...new Set(subs.map((row) => row.journeyId).filter(isNonNull))];
    const subscriptionIds = subs.map((row) => row.id);
    const roleIds = [...new Set(subs.flatMap((row) => asStringArray(row.params.roleIds)))];

    const dormantSince = new Date(Date.now() - DORMANT_WINDOW_DAYS * DAY_MS);
    const [
      firstEvents,
      ctaEvents,
      telegramEvents,
      vacancyClickEvents,
      recentDigestEvents,
      roleNodes,
      journeySubscriptionCounts,
      feedClickEvents,
      lastActionByJourneyRows,
      lastActionBySubRows,
      firstTouchRows,
    ] = await Promise.all([
      this.db
        .select({
          journeyId: productEvents.journeyId,
          at: sql<Date>`min(${productEvents.occurredAt})`,
        })
        .from(productEvents)
        .where(inArray(productEvents.journeyId, journeyIds))
        .groupBy(productEvents.journeyId),
      this.db
        .select({
          journeyId: productEvents.journeyId,
          at: sql<Date>`min(${productEvents.occurredAt})`,
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.journeyId, journeyIds),
            eq(productEvents.name, ANALYTICS_EVENTS.landingCtaClicked),
          ),
        )
        .groupBy(productEvents.journeyId),
      this.db
        .select({
          subscriptionId: productEvents.subscriptionId,
          at: sql<Date>`min(${productEvents.occurredAt})`,
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.subscriptionId, subscriptionIds),
            eq(productEvents.name, ANALYTICS_EVENTS.telegramLinked),
          ),
        )
        .groupBy(productEvents.subscriptionId),
      this.db
        .select({
          subscriptionId: productEvents.subscriptionId,
          clicks: count(),
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.subscriptionId, subscriptionIds),
            eq(productEvents.name, ANALYTICS_EVENTS.digestLinkClicked),
          ),
        )
        .groupBy(productEvents.subscriptionId),
      // Dormancy input: digests that actually landed recently — the same
      // definition the subscriberStates tiles use, so the row badge and the
      // headline numbers can never disagree.
      this.db
        .select({
          subscriptionId: productEvents.subscriptionId,
          digests: count(),
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.subscriptionId, subscriptionIds),
            eq(productEvents.name, ANALYTICS_EVENTS.digestSent),
            gte(productEvents.occurredAt, dormantSince),
          ),
        )
        .groupBy(productEvents.subscriptionId),
      roleIds.length > 0
        ? this.db
            .select({ id: nodes.id, name: nodes.canonicalName })
            .from(nodes)
            .where(inArray(nodes.id, roleIds))
        : Promise.resolve([]),
      // Unfiltered by population/chatId — this counts every subscription a
      // journey has ever had, the denominator for the feed-click 1:1 guard.
      this.db
        .select({
          journeyId: subscriptions.journeyId,
          subscriptionCount: count(),
        })
        .from(subscriptions)
        .where(inArray(subscriptions.journeyId, journeyIds))
        .groupBy(subscriptions.journeyId),
      this.db
        .select({
          journeyId: productEvents.journeyId,
          clicks: count(),
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.journeyId, journeyIds),
            eq(productEvents.name, ANALYTICS_EVENTS.applyClicked),
          ),
        )
        .groupBy(productEvents.journeyId),
      // "Last action" spans both attachment points: browsing events hang off the
      // journey, digest/link events off the subscription. Take the newest of
      // either, and only from USER_ACTION_EVENTS so our own digest sends never
      // resurrect a silent subscriber.
      this.db
        .select({
          journeyId: productEvents.journeyId,
          at: sql<Date>`max(${productEvents.occurredAt})`,
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.journeyId, journeyIds),
            inArray(productEvents.name, [...USER_ACTION_EVENTS]),
          ),
        )
        .groupBy(productEvents.journeyId),
      this.db
        .select({
          subscriptionId: productEvents.subscriptionId,
          at: sql<Date>`max(${productEvents.occurredAt})`,
        })
        .from(productEvents)
        .where(
          and(
            inArray(productEvents.subscriptionId, subscriptionIds),
            inArray(productEvents.name, [...USER_ACTION_EVENTS]),
          ),
        )
        .groupBy(productEvents.subscriptionId),
      // First touch per journey — the same pair the Channels panel groups on, so
      // a subscriber's row and the channel total can never disagree. Guarded on
      // empty: unlike drizzle's inArray, a raw `IN ()` is a syntax error, and
      // every subscription having a null journey_id is a real state.
      journeyIds.length === 0
        ? Promise.resolve({ rows: [] })
        : this.db.execute<{
            journey_id: string;
            source: string | null;
            referrer_domain: string | null;
          }>(sql`
        SELECT
          event.journey_id,
          (ARRAY_AGG(NULLIF(event.properties->>'utm_source', '') ORDER BY event.occurred_at))[1] AS source,
          (ARRAY_AGG(NULLIF(event.properties->>'referrer_domain', '') ORDER BY event.occurred_at))[1] AS referrer_domain
        FROM product_events event
        WHERE event.journey_id IN (${sql.join(
          journeyIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
          AND event.name IN (${ANALYTICS_EVENTS.landingView}, ${ANALYTICS_EVENTS.landingCtaClicked})
        GROUP BY event.journey_id
      `),
    ]);

    // node-postgres's driver returns raw `min(timestamptz)` aggregates as
    // strings (drizzle only auto-maps real columns, not sql-tagged ones) —
    // coerce to Date so downstream comparisons/getTime() calls are safe.
    const firstEventByJourney = new Map(
      firstEvents.map((row) => [row.journeyId, new Date(row.at)]),
    );
    const ctaByJourney = new Map(ctaEvents.map((row) => [row.journeyId, new Date(row.at)]));
    const telegramLinkedBySub = new Map(
      telegramEvents
        .filter((row): row is { subscriptionId: string; at: Date } => row.subscriptionId !== null)
        .map((row) => [row.subscriptionId, new Date(row.at)]),
    );
    const vacancyClicksBySub = new Map(
      vacancyClickEvents
        .filter(
          (row): row is { subscriptionId: string; clicks: number } => row.subscriptionId !== null,
        )
        .map((row) => [row.subscriptionId, row.clicks]),
    );
    const recentDigestsBySub = new Map(
      recentDigestEvents
        .filter(
          (row): row is { subscriptionId: string; digests: number } => row.subscriptionId !== null,
        )
        .map((row) => [row.subscriptionId, row.digests]),
    );
    const roleNameById = new Map(roleNodes.map((node) => [node.id, node.name]));
    const subscriptionCountByJourney = new Map(
      journeySubscriptionCounts.map((row) => [row.journeyId, row.subscriptionCount]),
    );
    const feedClicksByJourney = new Map(feedClickEvents.map((row) => [row.journeyId, row.clicks]));
    const lastActionByJourney = new Map(
      lastActionByJourneyRows.map((row) => [row.journeyId, new Date(row.at)]),
    );
    const lastActionBySub = new Map(
      lastActionBySubRows
        .filter((row): row is { subscriptionId: string; at: Date } => row.subscriptionId !== null)
        .map((row) => [row.subscriptionId, new Date(row.at)]),
    );
    const sourceByJourney = new Map(
      firstTouchRows.rows.map((row) => [
        row.journey_id,
        resolveChannelSource(row.source, row.referrer_domain),
      ]),
    );

    const byChat = new Map<string, (typeof subs)[number][]>();
    for (const row of subs) {
      if (!row.chatId) continue;
      const bucket = byChat.get(row.chatId) ?? [];
      bucket.push(row);
      byChat.set(row.chatId, bucket);
    }

    const rows: SubscriberActivity[] = [...byChat.entries()].map(([chatId, subRows]) => {
      const subscriptionSummaries: SubscriberSubscription[] = subRows.map((row) => ({
        id: row.id,
        isActive: row.isActive,
        isCv: row.candidateId !== null,
        trackLabel: this.trackLabel(row.params, roleNameById),
        createdAt: row.createdAt,
      }));
      const firstSeenAt = this.earliest(
        subRows.map((row) => firstEventByJourney.get(row.journeyId ?? "") ?? null),
      );
      const ctaClickedAt = this.earliest(
        subRows.map((row) => ctaByJourney.get(row.journeyId ?? "") ?? null),
      );
      const telegramLinkedAt = this.earliest(
        subRows.map((row) => telegramLinkedBySub.get(row.id) ?? row.linkedAt),
      );
      const vacancyClicks = subRows.reduce(
        (sum, row) => sum + (vacancyClicksBySub.get(row.id) ?? 0),
        0,
      );
      // Feed clicks live on the journey, not the subscription — only roll one
      // up to this subscriber when their journey has exactly one subscription,
      // so a journey shared by several subscriptions never gets double-counted.
      const feedClicks = subRows.reduce((sum, row) => {
        const journeyId = row.journeyId;
        if (!journeyId || subscriptionCountByJourney.get(journeyId) !== 1) return sum;
        return sum + (feedClicksByJourney.get(journeyId) ?? 0);
      }, 0);
      // created_at is NOT NULL, so unlike the other timestamps this always
      // resolves — the truthful "joined" date, independent of the ledger.
      const joinedAt = subRows.reduce(
        (min, row) => (row.createdAt < min ? row.createdAt : min),
        subRows[0].createdAt,
      );
      const lastActionAt = this.latest([
        ...subRows.map((row) => lastActionByJourney.get(row.journeyId ?? "") ?? null),
        ...subRows.map((row) => lastActionBySub.get(row.id) ?? null),
      ]);
      const tgUsername = subRows.map((row) => row.tgUsername).find(isNonNull) ?? null;
      const tgFirstName = subRows.map((row) => row.tgFirstName).find(isNonNull) ?? null;
      const isActive = subRows.some((row) => row.isActive);
      const recentDigests = subRows.reduce(
        (sum, row) => sum + (recentDigestsBySub.get(row.id) ?? 0),
        0,
      );

      return {
        chatId,
        tgUsername,
        tgFirstName,
        joinedAt,
        firstSeenAt,
        ctaClickedAt,
        telegramLinkedAt,
        lastActionAt,
        vacancyClicks,
        feedClicks,
        source:
          subRows.map((row) => sourceByJourney.get(row.journeyId ?? "")).find(isNonNull) ?? null,
        isActive,
        status: this.subscriberStatus(subRows, isActive, recentDigests, lastActionAt, dormantSince),
        subscriptions: subscriptionSummaries,
      };
    });

    // A subscriber belongs in the window if they joined in it OR did something
    // in it — filtering on join date alone would empty the list on `24h` even
    // though older subscribers are the ones still clicking.
    const inPeriod = since
      ? rows.filter(
          (row) =>
            row.joinedAt >= since || (row.lastActionAt !== null && row.lastActionAt >= since),
        )
      : rows;

    return inPeriod
      .sort(
        (a, b) =>
          (b.lastActionAt?.getTime() ?? b.joinedAt.getTime()) -
          (a.lastActionAt?.getTime() ?? a.joinedAt.getTime()),
      )
      .slice(0, SUBSCRIBER_ACTIVITY_LIMIT);
  }

  // Same lifecycle rules as the subscriberStates tiles, applied per chat.
  // Blocked outranks churned: both mean "no active subs", but blocked was not
  // the user pressing unsubscribe — it's the bot being cut off.
  private subscriberStatus(
    subRows: Array<{ deactivatedReason: string | null }>,
    isActive: boolean,
    recentDigests: number,
    lastActionAt: Date | null,
    dormantSince: Date,
  ): SubscriberStatus {
    if (!isActive) {
      const blocked = subRows.some(
        (row) => row.deactivatedReason === "blocked" || row.deactivatedReason === "unreachable",
      );
      return blocked ? "blocked" : "churned";
    }
    const silent = lastActionAt === null || lastActionAt < dormantSince;
    if (silent && recentDigests >= DORMANT_MIN_DIGESTS) return "dormant";
    return "active";
  }

  private trackLabel(params: Record<string, unknown>, roleNameById: Map<string, string>): string {
    const names = asStringArray(params.roleIds)
      .map((id) => roleNameById.get(id))
      .filter(isNonNull);
    return names.length > 0 ? names.join(", ") : UNLABELED_TRACK;
  }

  private earliest(dates: Array<Date | null>): Date | null {
    const valid = dates.filter(isNonNull);
    if (valid.length === 0) return null;
    return valid.reduce((min, date) => (date < min ? date : min));
  }

  private latest(dates: Array<Date | null>): Date | null {
    const valid = dates.filter(isNonNull);
    if (valid.length === 0) return null;
    return valid.reduce((max, date) => (date > max ? date : max));
  }

  private populationFilter(population: ProductAnalyticsPopulation) {
    if (population === "production") return eq(analyticsJourneys.isTest, false);
    if (population === "test") return eq(analyticsJourneys.isTest, true);
    return undefined;
  }
}
