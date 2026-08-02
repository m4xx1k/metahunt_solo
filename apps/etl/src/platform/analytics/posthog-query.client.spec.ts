import { ConfigService } from "@nestjs/config";

import { mapPostHogRows, PostHogQueryClient } from "./posthog-query.client";

const CONFIGURED_ENV = {
  POSTHOG_PERSONAL_API_KEY: "phx_test_key",
  POSTHOG_PRIVATE_HOST: "https://eu.posthog.com",
  POSTHOG_PROD_PROJECT_ID: "194218",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mapPostHogRows", () => {
  it("maps results onto columns by name, not position", () => {
    const rows = mapPostHogRows({
      columns: ["source", "people"],
      results: [
        ["direct", 12],
        ["google.com", 5],
      ],
    });

    expect(rows).toEqual([
      { source: "direct", people: 12 },
      { source: "google.com", people: 5 },
    ]);
  });

  it("returns an empty array when results/columns are missing", () => {
    expect(mapPostHogRows({})).toEqual([]);
  });

  it("returns an empty array when results is present but not an array", () => {
    expect(mapPostHogRows({ results: {} as unknown as unknown[][] })).toEqual([]);
  });
});

describe("PostHogQueryClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("is false when any of the three vars is missing", () => {
      const client = new PostHogQueryClient(new ConfigService({}));
      expect(client.isAvailable()).toBe(false);
    });

    it("is true when all three vars are present and well-formed", () => {
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));
      expect(client.isAvailable()).toBe(true);
    });

    it("is false when the personal key does not start with phx_", () => {
      const client = new PostHogQueryClient(
        new ConfigService({ ...CONFIGURED_ENV, POSTHOG_PERSONAL_API_KEY: "phc_wrong_kind" }),
      );
      expect(client.isAvailable()).toBe(false);
    });

    it("is false when the private host is actually the ingest host", () => {
      const client = new PostHogQueryClient(
        new ConfigService({ ...CONFIGURED_ENV, POSTHOG_PRIVATE_HOST: "https://eu.i.posthog.com" }),
      );
      expect(client.isAvailable()).toBe(false);
    });
  });

  describe("query", () => {
    it("returns null without ever calling fetch when not configured", async () => {
      global.fetch = jest.fn();
      const client = new PostHogQueryClient(new ConfigService({}));

      const result = await client.query("SELECT 1");

      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("maps a successful response to objects by column name", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ columns: ["dau"], results: [[42]] }));
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));

      const result = await client.query("SELECT dau FROM events");

      expect(result).toEqual([{ dau: 42 }]);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://eu.posthog.com/api/projects/194218/query/",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer phx_test_key",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            query: { kind: "HogQLQuery", query: "SELECT dau FROM events" },
          }),
        }),
      );
    });

    it("returns null on a non-2xx response and does not throw", async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 500));
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));

      const result = await client.query("SELECT 1");

      expect(result).toBeNull();
    });

    it("returns null on a 2xx response with a non-JSON body and does not throw", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 200 }));
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));

      await expect(client.query("SELECT 1")).resolves.toBeNull();
    });

    it("returns null when fetch rejects (timeout / network error) and does not throw", async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"));
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));

      await expect(client.query("SELECT 1")).resolves.toBeNull();
    });

    it("caches a result for the exact SQL string and does not re-fetch within the TTL", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse({ columns: ["dau"], results: [[1]] }));
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));
      let now = 1_000_000;
      client.clock = () => now;

      const first = await client.query("SELECT dau FROM events");
      now += 30_000; // still inside the 60s TTL
      const second = await client.query("SELECT dau FROM events");

      expect(first).toEqual([{ dau: 1 }]);
      expect(second).toEqual([{ dau: 1 }]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("re-fetches once the TTL has elapsed", async () => {
      global.fetch = jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse({ columns: ["dau"], results: [[1]] })),
        );
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));
      let now = 1_000_000;
      client.clock = () => now;

      await client.query("SELECT dau FROM events");
      now += 60_001; // just past the 60s TTL
      await client.query("SELECT dau FROM events");

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("caches distinct entries per exact SQL string", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse({ columns: ["dau"], results: [[1]] }))
        .mockResolvedValueOnce(jsonResponse({ columns: ["wau"], results: [[2]] }));
      const client = new PostHogQueryClient(new ConfigService(CONFIGURED_ENV));

      const a = await client.query("SELECT dau FROM events");
      const b = await client.query("SELECT wau FROM events");

      expect(a).toEqual([{ dau: 1 }]);
      expect(b).toEqual([{ wau: 2 }]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
