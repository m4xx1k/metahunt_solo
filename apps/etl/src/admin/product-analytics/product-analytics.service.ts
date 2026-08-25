import { Inject, Injectable } from "@nestjs/common";

import { count, gte, isNotNull, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import {
  PostHogQueryClient,
  type PostHogQueryRow,
} from "../../platform/analytics/posthog-query.client";
import { asStringArray } from "../../platform/shared/coerce";
import { reportingPeriodSince } from "../../platform/shared/reporting-period";

import { resolveChannelSource } from "./channel-source";
import {
  type CrmPeoplePage,
  type CrmPeopleSort,
  type ProductAnalyticsOverview,
  type ProductAnalyticsPeriod,
  type ProductDeliveryDay,
  type ProductDeliveryHealth,
  type ProductSubscriberStates,
  type SubscriberActivity,
  type SubscriberStatus,
  type SubscriberSubscription,
} from "./product-analytics.contract";

const { nodes, sentNotifications, subscriptions } = schema;
const CRM_PEOPLE_LIMIT = 50;
const SUBSCRIBER_ACTIVITY_LIMIT = 50;
const UNLABELED_TRACK = "усі ролі";
const DAY_MS = 24 * 60 * 60 * 1000;
// Dormant guards against marking a quiet-week narrow-track subscriber
// churned: digests must actually be landing with zero reply.
const DORMANT_WINDOW_DAYS = 14;
const DORMANT_MIN_DIGESTS = 3;
const DELIVERY_DAILY_WINDOW_DAYS = 7;
const PERSON_HISTORY_DAYS = 180;

// Every act a PERSON causes, as PostHog names them. Our own sends (`digest_sent`)
// are deliberately absent: counting them would make every subscriber look active
// forever. This is the PostHog half of what `USER_ACTION_EVENTS` meant to the
// ledger — the ledger's other names had their producers deleted in phase 2.
const PERSON_ACTION_EVENTS = [
  "$pageview",
  "account_created",
  "signed_in",
  "subscription_created",
  "telegram_linked",
  "vacancy_outbound_clicked",
  "subscription_deactivated",
] as const;

const PERSON_ACTIONS_SQL = PERSON_ACTION_EVENTS.map((name) => `'${name}'`).join(", ");
const IS_PERSON_ACTION = `e.event IN (${PERSON_ACTIONS_SQL})`;
// `vacancy_outbound_unattributed` has its own name since 2026-08-24; rows
// ingested under the shared name before that are told apart by this flag.
const ATTRIBUTED = "ifNull(toString(e.properties.is_anonymous), '') != 'true'";
const FEED_CLICK = `e.event = 'vacancy_outbound_clicked' AND e.properties.surface = 'web_feed' AND ${ATTRIBUTED}`;
const DIGEST_CLICK =
  "e.event = 'vacancy_outbound_clicked' AND e.properties.surface = 'telegram_digest'";

// What one person's PostHog side contributes to a roster row.
interface PersonActivity {
  lastActionAt: Date | null;
  feedClicks: number;
  digestClicks: number;
  actedSince: Date | null;
  source: string | null;
}

const EMPTY_ACTIVITY: PersonActivity = {
  lastActionAt: null,
  feedClicks: 0,
  digestClicks: 0,
  actedSince: null,
  source: null,
};

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// `since` (period) takes precedence; for "all" fall back to the span since
// the earliest scoped send so the ratio isn't divided by an arbitrary unit.
function periodDaysFor(since: Date | null, earliestAt: Date | null): number {
  if (since) return (Date.now() - since.getTime()) / DAY_MS;
  if (!earliestAt) return 0;
  return Math.max((Date.now() - earliestAt.getTime()) / DAY_MS, 1);
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// PostHog returns timestamps as strings, and an aggregate over zero matching
// rows comes back as the epoch rather than null — which would read as 1970.
function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear() < 2000 ? null : date;
}

// Row keys come back as `unknown`; narrow rather than stringify, so an
// unexpected shape drops the row instead of keying it on "[object Object]".
function toKey(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// HogQL takes no bind parameters on the query endpoint, so every id reaching a
// query string goes through this. Ids here are uuids read out of our own
// database, never request input, but the escape is what keeps that true.
function escapeHogql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// The roster, the subscriber lifecycle, and delivery health — everything the
// operator console still answers from our own stores. Behaviour comes from
// PostHog keyed on the person; "who exists" and "what we sent" stay in Postgres,
// where they are domain facts rather than an analytics echo.
@Injectable()
export class ProductAnalyticsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly posthog: PostHogQueryClient,
  ) {}

  async overview(period: ProductAnalyticsPeriod): Promise<ProductAnalyticsOverview> {
    const since = reportingPeriodSince(period);
    const createdPeriod = since ? gte(subscriptions.createdAt, since) : undefined;

    const [subscriptionRows, subscriberActivity, subscriberStates, deliverySummary, deliveryDaily] =
      await Promise.all([
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
          .from(subscriptions),
        this.subscriberActivity(since),
        this.subscriberStates(),
        this.deliverySummary(since),
        this.deliveryDaily(),
      ]);

    const subscriptionsRow = subscriptionRows[0];
    const delivered = subscriptionsRow?.delivered ?? 0;
    const linked = subscriptionsRow?.linked ?? 0;

    return {
      generatedAt: new Date(),
      period,
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
      subscriberActivity,
      subscriberStates,
      delivery: { ...deliverySummary, daily: deliveryDaily },
    };
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

    // Who exists is a Postgres question: an account, or a subscription's person.
    // The two converge on `users.id` once an account claims a subscription.
    const spine = await this.db.execute<{
      id: string;
      display_name: string | null;
      has_account: boolean;
      has_telegram: boolean;
      first_known_at: Date | string;
      subscriptions: number;
      has_active_subscription: boolean;
    }>(sql`
      WITH people_raw AS (
        SELECT
          u.id,
          true AS has_account,
          false AS has_telegram,
          u.created_at AS first_known_at,
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
      subscriptions_by_person AS (
        SELECT person_id AS id, COUNT(*)::int AS subscriptions, bool_or(is_active) AS has_active
        FROM subscriptions
        GROUP BY person_id
      )
      SELECT
        p.id::text AS id,
        COALESCE(MAX(p.display_name), 'Unknown person') AS display_name,
        bool_or(p.has_account) AS has_account,
        bool_or(p.has_telegram) AS has_telegram,
        MIN(p.first_known_at) AS first_known_at,
        COALESCE(MAX(s.subscriptions), 0)::int AS subscriptions,
        COALESCE(bool_or(s.has_active), false) AS has_active_subscription
      FROM people_raw p
      LEFT JOIN subscriptions_by_person s ON s.id = p.id
      GROUP BY p.id
    `);

    const activity = await this.personActivity(
      spine.rows.map((row) => row.id),
      { since, until },
    );

    const roster = spine.rows.map((row) => {
      const person = activity.get(row.id) ?? EMPTY_ACTIVITY;
      const lastProductActionAt = person.lastActionAt;
      const state: CrmPeoplePage["rows"][number]["state"] =
        row.subscriptions === 0
          ? "no_subscription"
          : !row.has_active_subscription ||
              lastProductActionAt === null ||
              (since !== null && lastProductActionAt < since)
            ? "at_risk"
            : "active";
      return {
        id: row.id,
        displayName: row.display_name ?? "Unknown person",
        hasAccount: row.has_account,
        hasTelegram: row.has_telegram,
        firstKnownAt: new Date(row.first_known_at),
        lastProductActionAt,
        subscriptions: row.subscriptions,
        feedClicks: person.feedClicks,
        telegramClicks: person.digestClicks,
        state,
      };
    });

    const metrics = {
      knownPeople: roster.length,
      telegramConnected: roster.filter((row) => row.hasTelegram).length,
      jobClickers: roster.filter((row) => row.feedClicks + row.telegramClicks > 0).length,
      atRisk: roster.filter((row) => row.state === "at_risk").length,
    };

    const filtered =
      query === ""
        ? roster
        : roster.filter(
            (row) =>
              row.id.toLowerCase().includes(query) || row.displayName.toLowerCase().includes(query),
          );

    const sorted = [...filtered].sort((a, b) => {
      if (input.sort === "first_known") {
        return a.firstKnownAt.getTime() - b.firstKnownAt.getTime() || a.id.localeCompare(b.id);
      }
      if (input.sort === "clicks") {
        return (
          b.feedClicks + b.telegramClicks - (a.feedClicks + a.telegramClicks) ||
          a.id.localeCompare(b.id)
        );
      }
      if (input.sort === "at_risk") {
        const risk = Number(b.state === "at_risk") - Number(a.state === "at_risk");
        if (risk !== 0) return risk;
      }
      return (
        (b.lastProductActionAt?.getTime() ?? -Infinity) -
          (a.lastProductActionAt?.getTime() ?? -Infinity) || a.id.localeCompare(b.id)
      );
    });

    return {
      metrics,
      rows: sorted.slice(offset, offset + limit),
      total: sorted.length,
      offset,
      limit,
    };
  }

  // Active / dormant / churned per chat. The chat spine and `is_active` are
  // domain state; "digests actually landed" is `sent_notifications`; "the person
  // answered" is PostHog. Dormant is the only early-warning signal for churn
  // this product has, so it is computed here rather than left to a saved query.
  private async subscriberStates(): Promise<ProductSubscriberStates> {
    const dormantSince = new Date(Date.now() - DORMANT_WINDOW_DAYS * DAY_MS);
    const chats = await this.db.execute<{
      chat_id: string;
      has_active: boolean;
      person_ids: string[];
      digests: number;
    }>(sql`
      WITH recent_digests AS (
        SELECT s.chat_id, COUNT(*)::int AS digests
        FROM (
          SELECT sn.subscription_id, date_trunc('hour', sn.sent_at) AS send
          FROM ${sentNotifications} sn
          WHERE sn.sent_at >= ${dormantSince}
          GROUP BY 1, 2
        ) sends
        JOIN ${subscriptions} s ON s.id = sends.subscription_id
        WHERE s.chat_id IS NOT NULL
        GROUP BY s.chat_id
      )
      SELECT
        s.chat_id AS chat_id,
        bool_or(s.is_active) AS has_active,
        array_agg(DISTINCT s.person_id::text) AS person_ids,
        COALESCE(MAX(rd.digests), 0)::int AS digests
      FROM ${subscriptions} s
      LEFT JOIN recent_digests rd ON rd.chat_id = s.chat_id
      WHERE s.chat_id IS NOT NULL
      GROUP BY s.chat_id
    `);

    const activity = await this.personActivity(
      chats.rows.flatMap((row) => row.person_ids),
      { since: dormantSince, until: null },
    );

    const states = { active: 0, dormant: 0, churned: 0 };
    for (const row of chats.rows) {
      if (!row.has_active) {
        states.churned += 1;
        continue;
      }
      const acted = row.person_ids.some(
        (personId) => (activity.get(personId) ?? EMPTY_ACTIVITY).actedSince !== null,
      );
      if (!acted && row.digests >= DORMANT_MIN_DIGESTS) states.dormant += 1;
      else states.active += 1;
    }
    return states;
  }

  // One row per chat. Everything that says "who" comes from `subscriptions`;
  // everything that says "what they did" comes from PostHog, keyed on the
  // person — so two subscriptions on one chat can never double-count a tap.
  private async subscriberActivity(since: Date | null): Promise<SubscriberActivity[]> {
    const subs = await this.db
      .select({
        id: subscriptions.id,
        chatId: subscriptions.chatId,
        personId: subscriptions.personId,
        tgUsername: subscriptions.tgUsername,
        tgFirstName: subscriptions.tgFirstName,
        candidateId: subscriptions.candidateId,
        isActive: subscriptions.isActive,
        deactivatedReason: subscriptions.deactivatedReason,
        createdAt: subscriptions.createdAt,
        linkedAt: subscriptions.linkedAt,
        params: subscriptions.params,
      })
      .from(subscriptions)
      .where(isNotNull(subscriptions.chatId));
    if (subs.length === 0) return [];

    const dormantSince = new Date(Date.now() - DORMANT_WINDOW_DAYS * DAY_MS);
    const roleIds = [...new Set(subs.flatMap((row) => asStringArray(row.params.roleIds)))];
    const [roleNodes, activity, recentDigests] = await Promise.all([
      roleIds.length > 0
        ? this.db
            .select({ id: nodes.id, name: nodes.canonicalName })
            .from(nodes)
            .where(sql`${nodes.id} in ${roleIds}`)
        : Promise.resolve([]),
      this.personActivity([...new Set(subs.map((row) => row.personId))], {
        since: null,
        until: null,
        actedSince: dormantSince,
      }),
      this.recentDigestsByChat(dormantSince),
    ]);
    const roleNameById = new Map(roleNodes.map((node) => [node.id, node.name]));

    const byChat = new Map<string, (typeof subs)[number][]>();
    for (const row of subs) {
      if (!row.chatId) continue;
      const bucket = byChat.get(row.chatId) ?? [];
      bucket.push(row);
      byChat.set(row.chatId, bucket);
    }

    const rows: SubscriberActivity[] = [...byChat.entries()].map(([chatId, subRows]) => {
      const people = [...new Set(subRows.map((row) => row.personId))].map(
        (personId) => activity.get(personId) ?? EMPTY_ACTIVITY,
      );
      const subscriptionSummaries: SubscriberSubscription[] = subRows.map((row) => ({
        id: row.id,
        isActive: row.isActive,
        isCv: row.candidateId !== null,
        trackLabel: this.trackLabel(row.params, roleNameById),
        createdAt: row.createdAt,
      }));
      // created_at is NOT NULL, so unlike the analytics timestamps this always
      // resolves — the truthful "joined" date, independent of any event store.
      const joinedAt = subRows.reduce(
        (min, row) => (row.createdAt < min ? row.createdAt : min),
        subRows[0].createdAt,
      );
      const lastActionAt = this.latest(people.map((person) => person.lastActionAt));
      const isActive = subRows.some((row) => row.isActive);
      const recentDigestCount = recentDigests.get(chatId) ?? 0;
      const acted = people.some((person) => person.actedSince !== null);

      return {
        chatId,
        tgUsername: subRows.map((row) => row.tgUsername).find(isNonNull) ?? null,
        tgFirstName: subRows.map((row) => row.tgFirstName).find(isNonNull) ?? null,
        joinedAt,
        telegramLinkedAt: this.earliest(subRows.map((row) => row.linkedAt)),
        lastActionAt,
        vacancyClicks: people.reduce((sum, person) => sum + person.digestClicks, 0),
        feedClicks: people.reduce((sum, person) => sum + person.feedClicks, 0),
        source: people.map((person) => person.source).find(isNonNull) ?? null,
        isActive,
        status: this.subscriberStatus(subRows, isActive, recentDigestCount, acted),
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

  // A digest is one send to one subscription. Rows land one per vacancy inside
  // it, each with its own `sent_at`, and the schedule is hourly — so the hour
  // is the send. Verified against `digest_sent` over every day the ledger ran.
  private async recentDigestsByChat(since: Date): Promise<Map<string, number>> {
    const result = await this.db.execute<{ chat_id: string; digests: number }>(sql`
      SELECT s.chat_id AS chat_id, COUNT(*)::int AS digests
      FROM (
        SELECT sn.subscription_id, date_trunc('hour', sn.sent_at) AS send
        FROM ${sentNotifications} sn
        WHERE sn.sent_at >= ${since}
        GROUP BY 1, 2
      ) sends
      JOIN ${subscriptions} s ON s.id = sends.subscription_id
      WHERE s.chat_id IS NOT NULL
      GROUP BY s.chat_id
    `);
    return new Map(result.rows.map((row) => [row.chat_id, Number(row.digests)]));
  }

  private async deliverySummary(since: Date | null): Promise<Omit<ProductDeliveryHealth, "daily">> {
    const result = await this.db.execute<{
      digests_sent: number;
      chats_reached: number;
      earliest_at: string | null;
    }>(sql`
      WITH sends AS (
        SELECT s.chat_id, MIN(sn.sent_at) AS sent_at
        FROM ${sentNotifications} sn
        JOIN ${subscriptions} s ON s.id = sn.subscription_id
        WHERE s.chat_id IS NOT NULL
          AND (${since}::timestamptz IS NULL OR sn.sent_at >= ${since})
        GROUP BY s.chat_id, sn.subscription_id, date_trunc('hour', sn.sent_at)
      )
      SELECT
        (SELECT COUNT(*) FROM sends)::int AS digests_sent,
        (SELECT COUNT(DISTINCT chat_id) FROM sends)::int AS chats_reached,
        (SELECT MIN(sent_at) FROM sends) AS earliest_at
    `);
    const row = result.rows[0];
    const digestsSent = Number(row?.digests_sent ?? 0);
    const chatsReached = Number(row?.chats_reached ?? 0);
    const days = periodDaysFor(since, row?.earliest_at ? new Date(row.earliest_at) : null);
    return {
      digestsSent,
      chatsReached,
      messagesPerChatPerDay: chatsReached > 0 && days > 0 ? digestsSent / (chatsReached * days) : 0,
    };
  }

  // Fixed 7-day drill-down for the Delivery panel, independent of the page's
  // period selector — a supplementary trend, not the headline number.
  private async deliveryDaily(): Promise<ProductDeliveryDay[]> {
    const result = await this.db.execute<{ date: string; digests: number; chats: number }>(sql`
      WITH buckets AS (
        SELECT (date_trunc('day', now()) - (day_offset::text || ' days')::interval)::date AS day
        FROM generate_series(0, ${DELIVERY_DAILY_WINDOW_DAYS - 1}) AS day_offset
      ),
      sends AS (
        SELECT date_trunc('day', MIN(sn.sent_at))::date AS day, s.chat_id
        FROM ${sentNotifications} sn
        JOIN ${subscriptions} s ON s.id = sn.subscription_id
        WHERE s.chat_id IS NOT NULL
          AND sn.sent_at >= now() - (${DELIVERY_DAILY_WINDOW_DAYS}::text || ' days')::interval
        GROUP BY s.chat_id, sn.subscription_id, date_trunc('hour', sn.sent_at)
      ),
      send_counts AS (
        SELECT day, COUNT(*)::int AS digests, COUNT(DISTINCT chat_id)::int AS chats
        FROM sends GROUP BY day
      )
      SELECT
        to_char(buckets.day, 'YYYY-MM-DD') AS date,
        COALESCE(send_counts.digests, 0)::int AS digests,
        COALESCE(send_counts.chats, 0)::int AS chats
      FROM buckets
      LEFT JOIN send_counts ON send_counts.day = buckets.day
      ORDER BY buckets.day
    `);
    return result.rows.map((row) => {
      const digests = Number(row.digests);
      const chats = Number(row.chats);
      return { date: row.date, digests, chats, perChat: chats > 0 ? digests / chats : 0 };
    });
  }

  // One PostHog round trip for every person the caller needs. Grouping is on
  // PostHog's `person_id` rather than our id directly: an account that claimed a
  // Telegram subscription — or a browser journey aliased into a subscriber — is
  // one person there under several distinct ids, and only the merged view sees
  // all of their events.
  private async personActivity(
    personIds: string[],
    window: { since: Date | null; until: Date | null; actedSince?: Date },
  ): Promise<Map<string, PersonActivity>> {
    const ids = [...new Set(personIds.filter((id) => id.length > 0))];
    if (ids.length === 0 || !this.posthog.isAvailable()) return new Map();

    const idList = ids.map((id) => `'${escapeHogql(id)}'`).join(", ");
    const clickWindow = [
      window.since ? `AND e.timestamp >= toDateTime('${hogTime(window.since)}', 'UTC')` : "",
      window.until ? `AND e.timestamp < toDateTime('${hogTime(window.until)}', 'UTC')` : "",
    ].join(" ");
    const actedSince = window.actedSince ?? window.since;
    const actedClause = actedSince
      ? `AND e.timestamp >= toDateTime('${hogTime(actedSince)}', 'UTC')`
      : "";

    const rows = await this.posthog.query(`
      WITH anchors AS (
          SELECT distinct_id AS person_key, argMax(person_id, timestamp) AS merged_id
          FROM events
          WHERE distinct_id IN (${idList})
            AND timestamp >= now() - INTERVAL ${PERSON_HISTORY_DAYS} DAY
          GROUP BY distinct_id
      )
      SELECT
          a.person_key AS person_key,
          maxIf(e.timestamp, ${IS_PERSON_ACTION}) AS last_action_at,
          maxIf(e.timestamp, ${IS_PERSON_ACTION} ${actedClause}) AS acted_since,
          countIf(${FEED_CLICK} ${clickWindow}) AS feed_clicks,
          countIf(${DIGEST_CLICK} ${clickWindow}) AS digest_clicks,
          argMinIf(
            coalesce(nullIf(toString(e.properties.$referring_domain), ''), 'direct'),
            e.timestamp,
            e.event = '$pageview'
          ) AS referrer
      FROM events e
      INNER JOIN anchors a ON e.person_id = a.merged_id
      WHERE e.timestamp >= now() - INTERVAL ${PERSON_HISTORY_DAYS} DAY
      GROUP BY a.person_key
    `);
    if (rows === null) return new Map();

    return new Map(
      rows.map((row: PostHogQueryRow) => [
        toKey(row.person_key),
        {
          lastActionAt: toDateOrNull(row.last_action_at),
          feedClicks: toNumber(row.feed_clicks),
          digestClicks: toNumber(row.digest_clicks),
          actedSince: toDateOrNull(row.acted_since),
          source: resolveChannelSource(null, asReferrer(row.referrer)),
        },
      ]),
    );
  }

  // Same lifecycle rules as the subscriberStates tiles, applied per chat.
  // Blocked outranks churned: both mean "no active subs", but blocked was not
  // the user pressing unsubscribe — it's the bot being cut off.
  private subscriberStatus(
    subRows: Array<{ deactivatedReason: string | null }>,
    isActive: boolean,
    recentDigests: number,
    actedRecently: boolean,
  ): SubscriberStatus {
    if (!isActive) {
      const blocked = subRows.some(
        (row) => row.deactivatedReason === "blocked" || row.deactivatedReason === "unreachable",
      );
      return blocked ? "blocked" : "churned";
    }
    if (!actedRecently && recentDigests >= DORMANT_MIN_DIGESTS) return "dormant";
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
}

function hogTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

// `direct` is the query's own stand-in for "no referrer"; the channel resolver
// wants the absence, not the word, so it can report null rather than invent one.
function asReferrer(value: unknown): string | null {
  const referrer = typeof value === "string" ? value : "";
  return referrer === "" || referrer === "direct" ? null : referrer;
}
