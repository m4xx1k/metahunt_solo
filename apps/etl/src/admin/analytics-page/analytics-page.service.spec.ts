import { Test } from "@nestjs/testing";

import { DRIZZLE } from "@metahunt/database";

import { PostHogQueryClient } from "../../platform/analytics/posthog-query.client";

import { AnalyticsPageService } from "./analytics-page.service";

type Row = Record<string, unknown>;

type DbMock = { execute: jest.Mock };

function emptyDbMock(): DbMock {
  return { execute: jest.fn().mockResolvedValue({ rows: [] }) };
}

type PostHogMock = { isAvailable: jest.Mock; query: jest.Mock };

function postHogMock(available: boolean): PostHogMock {
  return { isAvailable: jest.fn().mockReturnValue(available), query: jest.fn() };
}

async function bootstrap(db: DbMock, postHog: PostHogMock): Promise<AnalyticsPageService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AnalyticsPageService,
      { provide: DRIZZLE, useValue: db },
      { provide: PostHogQueryClient, useValue: postHog },
    ],
  }).compile();
  return moduleRef.get(AnalyticsPageService);
}

describe("AnalyticsPageService", () => {
  describe("metrics", () => {
    it("returns available:false with zeroed defaults when PostHog is unconfigured, without calling query", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(false);
      const svc = await bootstrap(db, postHog);

      const result = await svc.metrics("30d");

      expect(result).toEqual({
        available: false,
        activeUsers: { dau: 0, wau: 0, mau: 0 },
        funnel: [
          { step: "visited", label: "Visited", people: 0, conversionFromPrev: null },
          { step: "started", label: "Started subscription", people: 0, conversionFromPrev: null },
          { step: "handoff", label: "Opened handoff", people: 0, conversionFromPrev: null },
          { step: "linked", label: "Linked Telegram", people: 0, conversionFromPrev: null },
        ],
        ctaClicks: 0,
        sources: [],
      });
      expect(postHog.query).not.toHaveBeenCalled();
    });

    it("maps active users, funnel (with cta split out), and sources when available", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockImplementation((hogql: string) => {
        if (hogql.includes("uniqIf(person_id, timestamp")) {
          return Promise.resolve([{ dau: 10, wau: 40, mau: 478 }]);
        }
        if (hogql.includes("subscription_create_started")) {
          return Promise.resolve([{ visited: 478, started: 26, handoff: 25, linked: 31, cta: 20 }]);
        }
        return Promise.resolve([
          { source: "direct", people: 300 },
          { source: null, people: 5 },
        ]);
      });
      const svc = await bootstrap(db, postHog);

      const result = await svc.metrics("30d");

      expect(result.available).toBe(true);
      expect(result.activeUsers).toEqual({ dau: 10, wau: 40, mau: 478 });
      expect(result.ctaClicks).toBe(20);
      expect(result.funnel).toEqual([
        { step: "visited", label: "Visited", people: 478, conversionFromPrev: null },
        { step: "started", label: "Started subscription", people: 26, conversionFromPrev: 5.4 },
        { step: "handoff", label: "Opened handoff", people: 25, conversionFromPrev: 96.2 },
        { step: "linked", label: "Linked Telegram", people: 31, conversionFromPrev: 124 },
      ]);
      expect(result.sources).toEqual([
        { source: "direct", people: 300 },
        { source: "direct", people: 5 },
      ]);
    });

    it("adds a $referring_domain filter to active-users and funnel queries when source is set", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockResolvedValue([]);
      const svc = await bootstrap(db, postHog);

      await svc.metrics("7d", "linkedin.com");

      const calledQueries = postHog.query.mock.calls.map(([hogql]: [string]) => hogql);
      expect(calledQueries[0]).toContain("properties.$referring_domain = 'linkedin.com'");
      expect(calledQueries[1]).toContain("properties.$referring_domain = 'linkedin.com'");
      // The sources query itself selects $referring_domain as a column (it's
      // how you'd discover a source to filter by) but must not be filtered
      // down to a single source by the currently-applied filter.
      expect(calledQueries[2]).not.toContain("$referring_domain = 'linkedin.com'");
    });

    it("never queries a window wider than the picker for a narrow period", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockResolvedValue([]);
      const svc = await bootstrap(db, postHog);

      await svc.metrics("24h");

      const activeUsersQuery = postHog.query.mock.calls[0][0] as string;
      expect(activeUsersQuery).toContain("INTERVAL 1 DAY");
      expect(activeUsersQuery).not.toContain("INTERVAL 30 DAY");
      expect(activeUsersQuery).not.toContain("INTERVAL 7 DAY");
    });

    it("scales the mau window up to 90 days so 90d and 30d emit different active-users queries", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockResolvedValue([]);
      const svc = await bootstrap(db, postHog);

      await svc.metrics("30d");
      const query30d = postHog.query.mock.calls[0][0] as string;
      postHog.query.mockClear();

      await svc.metrics("90d");
      const query90d = postHog.query.mock.calls[0][0] as string;

      expect(query30d).toContain("INTERVAL 30 DAY");
      expect(query90d).toContain("INTERVAL 90 DAY");
      expect(query90d).not.toEqual(query30d);
    });

    it("escapes a backslash before a quote so it cannot uncomment out of the HogQL string literal", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockResolvedValue([]);
      const svc = await bootstrap(db, postHog);

      await svc.metrics("30d", "a\\' OR 1=1 --");

      const activeUsersQuery = postHog.query.mock.calls[0][0] as string;
      expect(activeUsersQuery).toContain("properties.$referring_domain = 'a\\\\\\' OR 1=1 --'");
    });

    it("returns available:false with zeroed defaults when every PostHog query fails", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockResolvedValue(null);
      const svc = await bootstrap(db, postHog);

      const result = await svc.metrics("30d");

      expect(result).toEqual({
        available: false,
        activeUsers: { dau: 0, wau: 0, mau: 0 },
        funnel: [
          { step: "visited", label: "Visited", people: 0, conversionFromPrev: null },
          { step: "started", label: "Started subscription", people: 0, conversionFromPrev: null },
          { step: "handoff", label: "Opened handoff", people: 0, conversionFromPrev: null },
          { step: "linked", label: "Linked Telegram", people: 0, conversionFromPrev: null },
        ],
        ctaClicks: 0,
        sources: [],
      });
    });

    it("stays available:true when only some PostHog queries fail", async () => {
      const db = emptyDbMock();
      const postHog = postHogMock(true);
      postHog.query.mockImplementation((hogql: string) =>
        hogql.includes("uniqIf(person_id, timestamp") ? Promise.resolve(null) : Promise.resolve([]),
      );
      const svc = await bootstrap(db, postHog);

      const result = await svc.metrics("30d");

      expect(result.available).toBe(true);
      expect(result.activeUsers).toEqual({ dau: 0, wau: 0, mau: 0 });
    });
  });

  describe("people", () => {
    it("returns Postgres-only rows with null PostHog fields when unavailable", async () => {
      const rows: Row[] = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          display_name: "Ada",
          has_account: true,
          providers: ["google"],
          registered_at: "2026-07-01T00:00:00.000Z",
          subscriptions: 2,
          active_subscriptions: 1,
          first_subscription_at: "2026-07-02T00:00:00.000Z",
          telegram_linked: true,
          total: 1,
        },
      ];
      const db = { execute: jest.fn().mockResolvedValue({ rows }) };
      const postHog = postHogMock(false);
      const svc = await bootstrap(db, postHog);

      const result = await svc.people({
        period: "30d",
        limit: 50,
        offset: 0,
        sort: "registeredAt",
        dir: "desc",
      });

      expect(result.total).toBe(1);
      expect(result.rows).toEqual([
        {
          personId: "11111111-1111-1111-1111-111111111111",
          displayName: "Ada",
          hasAccount: true,
          providers: ["google"],
          registeredAt: "2026-07-01T00:00:00.000Z",
          subscriptions: 2,
          activeSubscriptions: 1,
          firstSubscriptionAt: "2026-07-02T00:00:00.000Z",
          telegramLinked: true,
          firstEventAt: null,
          lastEventAt: null,
          pageviews: null,
          feedClicks: null,
          digestClicks: null,
          minutesToRegistration: null,
          minutesToSubscription: null,
        },
      ]);
      expect(postHog.query).not.toHaveBeenCalled();
    });

    it("merges PostHog rows onto the roster by person_id, not by position", async () => {
      const rows: Row[] = [
        {
          id: "aaaaaaaa-1111-1111-1111-111111111111",
          display_name: "First",
          has_account: false,
          providers: [],
          registered_at: null,
          subscriptions: 1,
          active_subscriptions: 1,
          first_subscription_at: "2026-07-10T00:00:00.000Z",
          telegram_linked: true,
          total: 2,
        },
        {
          id: "bbbbbbbb-2222-2222-2222-222222222222",
          display_name: "Second",
          has_account: false,
          providers: [],
          registered_at: null,
          subscriptions: 1,
          active_subscriptions: 0,
          first_subscription_at: "2026-07-05T00:00:00.000Z",
          telegram_linked: true,
          total: 2,
        },
      ];
      const db = { execute: jest.fn().mockResolvedValue({ rows }) };
      const postHog = postHogMock(true);
      // Returned in the OPPOSITE order of the roster rows above.
      postHog.query.mockResolvedValue([
        {
          person_id: "bbbbbbbb-2222-2222-2222-222222222222",
          first_event_at: "2026-07-01T00:00:00.000Z",
          last_event_at: "2026-07-04T00:00:00.000Z",
          pageviews: 3,
          feed_clicks: 1,
          digest_clicks: 0,
        },
        {
          person_id: "aaaaaaaa-1111-1111-1111-111111111111",
          first_event_at: "2026-07-08T00:00:00.000Z",
          last_event_at: "2026-07-09T00:00:00.000Z",
          pageviews: 5,
          feed_clicks: 2,
          digest_clicks: 1,
        },
      ]);
      const svc = await bootstrap(db, postHog);

      const result = await svc.people({
        period: "30d",
        limit: 50,
        offset: 0,
        sort: "registeredAt",
        dir: "desc",
      });

      const first = result.rows.find((r) => r.personId === "aaaaaaaa-1111-1111-1111-111111111111");
      const second = result.rows.find((r) => r.personId === "bbbbbbbb-2222-2222-2222-222222222222");

      expect(first?.pageviews).toBe(5);
      expect(first?.minutesToSubscription).toBe(
        Math.round(
          (new Date("2026-07-10T00:00:00.000Z").getTime() -
            new Date("2026-07-08T00:00:00.000Z").getTime()) /
            60_000,
        ),
      );
      expect(second?.pageviews).toBe(3);
      // first_event_at (07-01) precedes first_subscription_at (07-05) — a normal positive gap.
      expect(second?.minutesToSubscription).not.toBeNull();
    });

    it("caps the page size at 100 regardless of a larger requested limit", async () => {
      const db = { execute: jest.fn().mockResolvedValue({ rows: [] }) };
      const postHog = postHogMock(false);
      const svc = await bootstrap(db, postHog);

      await svc.people({ period: "30d", limit: 500, offset: 0, sort: "registeredAt", dir: "desc" });

      const [sqlQuery] = db.execute.mock.calls[0] as [{ queryChunks: unknown[] }];
      expect(sqlQuery.queryChunks).toContain(100);
      expect(sqlQuery.queryChunks).not.toContain(500);
    });

    it("keeps the total when the requested offset has no rows", async () => {
      const db = {
        execute: jest.fn().mockResolvedValue({ rows: [{ id: null, total: 2 }] }),
      };
      const postHog = postHogMock(false);
      const svc = await bootstrap(db, postHog);

      await expect(
        svc.people({ period: "30d", limit: 50, offset: 100, sort: "registeredAt", dir: "desc" }),
      ).resolves.toEqual({ total: 2, rows: [] });
    });
  });
});
