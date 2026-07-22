import { Inject, Injectable } from "@nestjs/common";

import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { ANALYTICS_EVENTS } from "../../platform/analytics/events";
import { asStringArray } from "../../platform/shared/coerce";
import { reportingPeriodSince } from "../../platform/shared/reporting-period";

import {
  PRODUCT_FUNNEL_STEPS,
  type AnalyticsJourneyClassification,
  type ProductAnalyticsOverview,
  type ProductAnalyticsPeriod,
  type ProductAnalyticsPopulation,
  type ProductIdentityHealth,
  type RecentProductJourney,
  type SubscriberActivity,
  type SubscriberSubscription,
  type UpdateAnalyticsJourneyDto,
} from "./product-analytics.contract";

const { analyticsJourneys, nodes, productEvents, sentNotifications, subscriptions } = schema;
const RECENT_JOURNEY_LIMIT = 30;
const SUBSCRIBER_ACTIVITY_LIMIT = 50;
const UNLABELED_TRACK = "усі ролі";

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
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

    const [eventRows, subscriptionRows, identityRows, recentJourneys, subscriberActivity] =
      await Promise.all([
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
        this.subscriberActivity(population),
      ]);

    const subscriptionsRow = subscriptionRows[0];
    const delivered = subscriptionsRow?.delivered ?? 0;
    const linked = subscriptionsRow?.linked ?? 0;

    return {
      generatedAt: new Date(),
      period,
      population,
      funnel: PRODUCT_FUNNEL_STEPS.map((name) => {
        const row = eventRows.find((item) => item.name === name);
        return { name, events: row?.events ?? 0, journeys: row?.journeys ?? 0 };
      }),
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
      identity: identityRows,
      recentJourneys,
      subscriberActivity,
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

  private async orderedFunnel(since: Date | null, population: ProductAnalyticsPopulation) {
    const stepValues = sql.join(
      PRODUCT_FUNNEL_STEPS.map((name, index) => sql`(${index + 1}::int, ${name}::text)`),
      sql`, `,
    );
    const result = await this.db.execute<{
      name: (typeof PRODUCT_FUNNEL_STEPS)[number];
      events: number;
      journeys: number;
    }>(sql`
      WITH RECURSIVE
      step_definitions(step_index, name) AS (VALUES ${stepValues}),
      cohort AS (
        SELECT id
        FROM analytics_journeys
        WHERE (${since}::timestamptz IS NULL OR created_at >= ${since})
          AND (
            ${population} = 'all'
            OR (${population} = 'production' AND NOT is_test)
            OR (${population} = 'test' AND is_test)
          )
      ),
      ordered_steps(journey_id, step_index, step_at, landing_at) AS (
        SELECT id, 0, NULL::timestamptz, NULL::timestamptz
        FROM cohort
        UNION ALL
        SELECT
          previous.journey_id,
          definition.step_index,
          next_event.step_at,
          CASE
            WHEN definition.step_index = 1 THEN next_event.step_at
            ELSE previous.landing_at
          END
        FROM ordered_steps previous
        JOIN step_definitions definition
          ON definition.step_index = previous.step_index + 1
        CROSS JOIN LATERAL (
          SELECT MIN(event.occurred_at) AS step_at
          FROM product_events event
          WHERE event.journey_id = previous.journey_id
            AND event.name = definition.name
            AND (
              previous.step_index = 0
              OR event.occurred_at >= previous.step_at
            )
            AND (
              previous.step_index = 0
              OR event.occurred_at <= previous.landing_at + INTERVAL '7 days'
            )
        ) next_event
        WHERE next_event.step_at IS NOT NULL
      )
      SELECT
        definition.name,
        COUNT(ordered.journey_id)::int AS events,
        COUNT(ordered.journey_id)::int AS journeys
      FROM step_definitions definition
      LEFT JOIN ordered_steps ordered
        ON ordered.step_index = definition.step_index
      GROUP BY definition.step_index, definition.name
      ORDER BY definition.step_index
    `);
    return result.rows.map((row) => ({
      name: row.name,
      events: Number(row.events),
      journeys: Number(row.journeys),
    }));
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
  ): Promise<SubscriberActivity[]> {
    const populationFilter = this.populationFilter(population);
    const subs = await this.db
      .select({
        id: subscriptions.id,
        chatId: subscriptions.chatId,
        candidateId: subscriptions.candidateId,
        isActive: subscriptions.isActive,
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

    const [firstEvents, ctaEvents, telegramEvents, vacancyClickEvents, roleNodes] =
      await Promise.all([
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
        roleIds.length > 0
          ? this.db
              .select({ id: nodes.id, name: nodes.canonicalName })
              .from(nodes)
              .where(inArray(nodes.id, roleIds))
          : Promise.resolve([]),
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
    const roleNameById = new Map(roleNodes.map((node) => [node.id, node.name]));

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

      return {
        chatId,
        firstSeenAt,
        ctaClickedAt,
        telegramLinkedAt,
        vacancyClicks,
        subscriptions: subscriptionSummaries,
      };
    });

    return rows
      .sort((a, b) => (b.firstSeenAt?.getTime() ?? 0) - (a.firstSeenAt?.getTime() ?? 0))
      .slice(0, SUBSCRIBER_ACTIVITY_LIMIT);
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

  private populationFilter(population: ProductAnalyticsPopulation) {
    if (population === "production") return eq(analyticsJourneys.isTest, false);
    if (population === "test") return eq(analyticsJourneys.isTest, true);
    return undefined;
  }
}
