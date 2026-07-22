const DEFAULT_MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface ClientEventTimeWindow {
  maxAgeMs?: number;
  maxFutureSkewMs?: number;
}

/**
 * Bounds a client-provided timestamp before it reaches persistence.
 * Missing, stale, or implausibly future values become server receipt time.
 */
export function normalizeClientEventTime(
  raw: string | undefined,
  window: ClientEventTimeWindow = {},
): Date {
  const now = Date.now();
  if (!raw) return new Date(now);

  const value = new Date(raw).getTime();
  const maxAgeMs = window.maxAgeMs ?? DEFAULT_MAX_EVENT_AGE_MS;
  const maxFutureSkewMs = window.maxFutureSkewMs ?? DEFAULT_MAX_FUTURE_SKEW_MS;
  if (!Number.isFinite(value) || value < now - maxAgeMs || value > now + maxFutureSkewMs) {
    return new Date(now);
  }
  return new Date(value);
}
