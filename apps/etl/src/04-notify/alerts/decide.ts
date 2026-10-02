import type { ChatNotificationKind } from "@metahunt/database";

const HOUR_MS = 3_600_000;
export const ABSORB_WINDOW_MS = 24 * HOUR_MS;
export const COLLAPSE_WINDOW_MS = 72 * HOUR_MS;

export interface AlertCandidate {
  vacancyId: string;
  positionId: string;
  sourceId: string;
  versionAt: Date;
}

export interface LedgerEntry {
  vacancyId: string;
  sourceId: string;
  versionAt: Date;
  notifiedAt: Date | null;
  kind: ChatNotificationKind;
}

export interface MatchingSubscription {
  id: string;
  alertsBumps: boolean;
}

export type Decision =
  | { action: "skip"; reason: "seen" | "bumps_off" }
  | { action: "record"; kind: "absorbed" | "collapsed" }
  | { action: "send"; kind: "new" | "bumped" };

export interface DecideInput {
  candidate: AlertCandidate;
  row: LedgerEntry | null;
  siblings: LedgerEntry[];
  subscriptions: MatchingSubscription[];
  now: Date;
}

// The posting's version: the source's publish date, clamped to when we first
// saw that record. Clamping to `now()` would re-raise a future date every run.
export function versionOf(publishedAt: Date | null, loadedAt: Date, recordObservedAt: Date): Date {
  const stated = publishedAt ?? loadedAt;
  return stated.getTime() > recordObservedAt.getTime() ? recordObservedAt : stated;
}

const notifiedWithin = (entry: LedgerEntry, windowMs: number, now: Date): boolean =>
  entry.notifiedAt !== null && now.getTime() - entry.notifiedAt.getTime() < windowMs;

function latestNotified(entries: LedgerEntry[]): LedgerEntry | null {
  let latest: LedgerEntry | null = null;
  for (const entry of entries) {
    if (entry.notifiedAt === null) continue;
    if (!latest || entry.notifiedAt > latest.notifiedAt!) latest = entry;
  }
  return latest;
}

// Rules R1–R4 + R3b of md/journal/migrations/alerts.md §4. Pure: the caller
// supplies this chat's ledger rows for the posting and its position siblings.
export function decide({ candidate, row, siblings, subscriptions, now }: DecideInput): Decision {
  if (row && row.versionAt.getTime() >= candidate.versionAt.getTime()) {
    return { action: "skip", reason: "seen" };
  }
  if (row && notifiedWithin(row, ABSORB_WINDOW_MS, now)) {
    return { action: "record", kind: "absorbed" };
  }

  const others = siblings.filter((s) => s.vacancyId !== candidate.vacancyId);
  const crossSource = latestNotified(others.filter((s) => s.sourceId !== candidate.sourceId));
  if (crossSource && (!row || notifiedWithin(crossSource, COLLAPSE_WINDOW_MS, now))) {
    return { action: "record", kind: "collapsed" };
  }

  if (!row) {
    const sameSource = latestNotified(others.filter((s) => s.sourceId === candidate.sourceId));
    if (sameSource && notifiedWithin(sameSource, ABSORB_WINDOW_MS, now)) {
      return { action: "record", kind: "absorbed" };
    }
    if (!sameSource) return { action: "send", kind: "new" };
  }

  if (!subscriptions.some((s) => s.alertsBumps)) return { action: "skip", reason: "bumps_off" };
  return { action: "send", kind: "bumped" };
}
