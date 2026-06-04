// Outbound send governor for the Telegram bot. Two independent concerns, both
// dependency-free and unit-tested:
//   - RateLimiter: proactive spacing so we stay under Telegram's ~30 msg/s.
//   - withRetryAfter: reactive — honor a 429's `retry_after` instead of failing.
// The digest send path runs every message through both.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spaces successive operations by at least `minIntervalMs`. Each caller reserves
 * the next free slot synchronously, so the schedule is serialised even under
 * concurrent `acquire()` calls; an idle gap resets the cadence (no debt builds
 * up). Stateful and process-local — one instance per bot.
 */
export class RateLimiter {
  private nextSlot = 0;

  constructor(
    private readonly minIntervalMs: number,
    // Injected for tests; defaults to wall clock + real timers.
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  /** Resolve once this caller's reserved slot is due. */
  async acquire(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    const delay = slot - now;
    if (delay > 0) await this.wait(delay);
  }
}

/**
 * Telegram's 429 retry delay in ms, or null when `err` isn't a rate-limit error.
 * Duck-typed against grammy's `GrammyError` (`error_code` + `parameters
 * .retry_after`) so callers needn't import or `instanceof` it.
 */
export function retryAfterMs(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { error_code?: number; parameters?: { retry_after?: number } };
  if (e.error_code !== 429) return null;
  const seconds = e.parameters?.retry_after;
  return typeof seconds === "number" && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * Run `fn`, and on a Telegram 429 wait the advised `retry_after` and retry — up
 * to `maxRetries` times. Any non-429 error (or exhausted retries) propagates, so
 * Temporal's activity retry still backstops genuine failures.
 */
export async function withRetryAfter<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number; wait?: (ms: number) => Promise<void> },
): Promise<T> {
  const wait = opts.wait ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const ms = retryAfterMs(err);
      if (ms === null || attempt >= opts.maxRetries) throw err;
      await wait(ms);
    }
  }
}
