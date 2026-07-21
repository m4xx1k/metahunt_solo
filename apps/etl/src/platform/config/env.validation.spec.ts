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
});
