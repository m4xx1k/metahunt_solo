import { RateLimiter, retryAfterMs, withRetryAfter } from "./rate-limiter";

describe("RateLimiter", () => {
  // Drive the limiter with a virtual clock + a wait() that advances it, so the
  // schedule is asserted deterministically without real timers.
  function fakeClock() {
    let nowMs = 1_000;
    const waits: number[] = [];
    const now = () => nowMs;
    // Advance only on the microtask, after the awaiting acquire() yields — so a
    // synchronous burst of acquire() calls all read the same `now`, as they would
    // against a real clock.
    const wait = (ms: number) => {
      waits.push(ms);
      return Promise.resolve().then(() => {
        nowMs += ms;
      });
    };
    return { now, wait, waits, advance: (ms: number) => (nowMs += ms) };
  }

  it("lets the first acquire through without waiting", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(50, clock.now, clock.wait);

    await limiter.acquire();

    expect(clock.waits).toEqual([]);
  });

  it("spaces back-to-back acquires by the min interval", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(50, clock.now, clock.wait);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // First is free; each subsequent one waits a full interval.
    expect(clock.waits).toEqual([50, 50]);
  });

  it("resets cadence after an idle gap (no debt accrues)", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(50, clock.now, clock.wait);

    await limiter.acquire();
    clock.advance(1_000); // idle longer than the interval
    await limiter.acquire();

    expect(clock.waits).toEqual([]); // slot was already in the past
  });

  it("serialises concurrent acquires into spaced slots", async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(50, clock.now, clock.wait);

    // Slots are reserved synchronously, so firing three at once still spaces them.
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ]);

    expect(clock.waits).toEqual([50, 100]);
  });
});

describe("retryAfterMs", () => {
  it("returns the delay in ms for a 429 with retry_after", () => {
    expect(
      retryAfterMs({ error_code: 429, parameters: { retry_after: 3 } }),
    ).toBe(3000);
  });

  it("treats retry_after: 0 as a real (zero) delay", () => {
    expect(
      retryAfterMs({ error_code: 429, parameters: { retry_after: 0 } }),
    ).toBe(0);
  });

  it("returns null for non-429 errors", () => {
    expect(
      retryAfterMs({ error_code: 400, parameters: { retry_after: 3 } }),
    ).toBeNull();
  });

  it("returns null for a 429 without retry_after", () => {
    expect(retryAfterMs({ error_code: 429, parameters: {} })).toBeNull();
  });

  it("returns null for non-error shapes", () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("nope")).toBeNull();
    expect(retryAfterMs(new Error("network"))).toBeNull();
  });
});

describe("withRetryAfter", () => {
  it("returns the result without retrying on success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const wait = jest.fn().mockResolvedValue(undefined);

    const result = await withRetryAfter(fn, { maxRetries: 2, wait });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("waits the advised delay and retries on a 429, then succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ error_code: 429, parameters: { retry_after: 2 } })
      .mockResolvedValueOnce("ok");
    const wait = jest.fn().mockResolvedValue(undefined);

    const result = await withRetryAfter(fn, { maxRetries: 2, wait });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it("propagates a non-429 error immediately", async () => {
    const err = { error_code: 400, description: "bad request" };
    const fn = jest.fn().mockRejectedValue(err);
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(withRetryAfter(fn, { maxRetries: 2, wait })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("gives up after maxRetries and rethrows the last 429", async () => {
    const err = { error_code: 429, parameters: { retry_after: 1 } };
    const fn = jest.fn().mockRejectedValue(err);
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(withRetryAfter(fn, { maxRetries: 2, wait })).rejects.toBe(err);
    // initial attempt + 2 retries
    expect(fn).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
