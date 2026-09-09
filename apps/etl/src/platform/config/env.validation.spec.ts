import { validateEnv } from "./env.validation";

const requiredEnv = {
  DATABASE_URL: "postgresql://metahunt:metahunt@localhost:5432/metahunt",
};

describe("validateEnv", () => {
  it("uses a conservative Temporal activity concurrency default", () => {
    const result = validateEnv(requiredEnv);

    expect(result.TEMPORAL_MAX_CONCURRENT_ACTIVITIES).toBe(10);
  });

  it("accepts a configured Temporal activity concurrency limit", () => {
    const result = validateEnv({
      ...requiredEnv,
      TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "4",
    });

    expect(result.TEMPORAL_MAX_CONCURRENT_ACTIVITIES).toBe(4);
  });

  it("rejects an unsafe Temporal activity concurrency limit", () => {
    expect(() => validateEnv({ ...requiredEnv, TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "0" })).toThrow(
      'TEMPORAL_MAX_CONCURRENT_ACTIVITIES must be an integer in range 1..100, got "0"',
    );
  });

  it("defaults the digest resend lookback to 1 day", () => {
    const result = validateEnv(requiredEnv);

    expect(result.DIGEST_RESEND_LOOKBACK_DAYS).toBe(1);
  });

  it("accepts a configured digest resend lookback", () => {
    const result = validateEnv({ ...requiredEnv, DIGEST_RESEND_LOOKBACK_DAYS: "7" });

    expect(result.DIGEST_RESEND_LOOKBACK_DAYS).toBe(7);
  });

  it("rejects a digest resend lookback below 1", () => {
    expect(() => validateEnv({ ...requiredEnv, DIGEST_RESEND_LOOKBACK_DAYS: "0" })).toThrow(
      'DIGEST_RESEND_LOOKBACK_DAYS must be an integer in range 1..30, got "0"',
    );
  });

  describe("PostHog query vars (analytics page)", () => {
    it("validates the explicit local test-traffic switch", () => {
      expect(() => validateEnv({ ...requiredEnv, ANALYTICS_TEST_TRAFFIC: "sometimes" })).toThrow(
        'ANALYTICS_TEST_TRAFFIC must be true or false, got "sometimes"',
      );
      expect(
        validateEnv({ ...requiredEnv, ANALYTICS_TEST_TRAFFIC: "true" }).ANALYTICS_TEST_TRAFFIC,
      ).toBe("true");
    });

    it("rejects an invalid non-empty POSTHOG_PRIVATE_HOST", () => {
      expect(() => validateEnv({ ...requiredEnv, POSTHOG_PRIVATE_HOST: "not-a-url" })).toThrow(
        'POSTHOG_PRIVATE_HOST must be a valid URL, got "not-a-url"',
      );
    });
  });
});
