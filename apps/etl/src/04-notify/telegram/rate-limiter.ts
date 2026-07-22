// Outbound send governor for the Telegram bot. Two independent concerns, both
// dependency-free and unit-tested:
//   - RateLimiter: proactive spacing so we stay under Telegram's ~30 msg/s.
//   - withRetryAfter: reactive — honor a 429's `retry_after`, and give a short
//     fixed-delay retry to a transient network error, instead of failing.
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
 * True when `err` is a Telegram 403 — the chat is unreachable (bot blocked,
 * user deactivated, or bot can't open the chat). Permanent for this run: no
 * retry succeeds until the user acts, so the digest engine fails fast on it
 * instead of burning Temporal attempts. Duck-typed against grammy's
 * `GrammyError` (`error_code`), like `retryAfterMs`.
 */
export function isChatUnreachable(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { error_code?: number }).error_code === 403;
}

/** Network error codes that mean the request never reached Telegram at all
 * (dropped connection, DNS hiccup, timeout) — safe to retry since nothing was
 * sent, unlike a Telegram-side failure. */
const TRANSIENT_NETWORK_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

function codeOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * True when `err` carries a transient network error code. Duck-typed against
 * grammy's `HttpError` (`.error` holds the underlying fetch/socket error) and,
 * one level deeper, undici's `fetch failed` wrapper (`.cause`) — so both
 * shapes are checked for a matching `code`.
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const inner = (err as { error?: unknown }).error ?? err;
  const code = codeOf(inner) ?? codeOf((inner as { cause?: unknown }).cause);
  return code !== undefined && TRANSIENT_NETWORK_CODES.has(code);
}

/**
 * Run `fn`, and on a Telegram 429 wait the advised `retry_after` and retry — up
 * to `maxRetries` times. A transient network error (never reached Telegram)
 * gets its own short, fixed-delay retry budget instead. Any other error (or
 * exhausted retries) propagates, so Temporal's activity retry still backstops
 * genuine failures — including a 403 (`isChatUnreachable`), which must never
 * retry here.
 */
export async function withRetryAfter<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries: number;
    wait?: (ms: number) => Promise<void>;
    networkRetries?: number;
    networkRetryDelayMs?: number;
  },
): Promise<T> {
  const wait = opts.wait ?? sleep;
  const networkRetries = opts.networkRetries ?? 2;
  const networkRetryDelayMs = opts.networkRetryDelayMs ?? 750;
  let networkAttempts = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const rateLimitMs = retryAfterMs(err);
      if (rateLimitMs !== null) {
        if (attempt >= opts.maxRetries) throw err;
        await wait(rateLimitMs);
        continue;
      }
      if (isTransientNetworkError(err) && networkAttempts < networkRetries) {
        networkAttempts += 1;
        await wait(networkRetryDelayMs);
        continue;
      }
      throw err;
    }
  }
}
