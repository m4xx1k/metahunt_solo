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

  describe("PostHog query vars (analytics page)", () => {
    it("defaults to empty strings when absent, and still boots", () => {
      const result = validateEnv(requiredEnv);

      expect(result.POSTHOG_PERSONAL_API_KEY).toBe("");
      expect(result.POSTHOG_PRIVATE_HOST).toBe("");
      expect(result.POSTHOG_PROD_PROJECT_ID).toBe("");
    });

    it("fails closed when v2 is enabled without its separate ingestion/project configuration", () => {
      expect(() => validateEnv({ ...requiredEnv, ANALYTICS_V2: "true" })).toThrow(
        "POSTHOG_V2_API_KEY and POSTHOG_V2_PROJECT_ID are required when ANALYTICS_V2=true",
      );
    });

    it("accepts a fully configured v2 project without changing archive keys", () => {
      const result = validateEnv({
        ...requiredEnv,
        ANALYTICS_V2: "true",
        POSTHOG_V2_API_KEY: "phc_v2",
        POSTHOG_V2_PROJECT_ID: "202602",
      });

      expect(result.ANALYTICS_V2).toBe("true");
      expect(result.POSTHOG_V2_API_KEY).toBe("phc_v2");
      expect(result.POSTHOG_API_KEY).toBe("");
    });

    it("accepts all three when present", () => {
      const result = validateEnv({
        ...requiredEnv,
        POSTHOG_PERSONAL_API_KEY: "phx_test",
        POSTHOG_PRIVATE_HOST: "https://eu.posthog.com",
        POSTHOG_PROD_PROJECT_ID: "194218",
      });

      expect(result.POSTHOG_PERSONAL_API_KEY).toBe("phx_test");
      expect(result.POSTHOG_PRIVATE_HOST).toBe("https://eu.posthog.com");
      expect(result.POSTHOG_PROD_PROJECT_ID).toBe("194218");
    });

    it("rejects an invalid non-empty POSTHOG_PRIVATE_HOST", () => {
      expect(() => validateEnv({ ...requiredEnv, POSTHOG_PRIVATE_HOST: "not-a-url" })).toThrow(
        'POSTHOG_PRIVATE_HOST must be a valid URL, got "not-a-url"',
      );
    });
  });
});
