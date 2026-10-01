import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { renderAlertCard } from "../telegram/digest.renderer";
import { isChatUnreachable } from "../telegram/rate-limiter";
import { SentNotificationsService } from "../telegram/sent-notifications.service";
import { SubscriptionsService, type AlertSubscriptionRow } from "../telegram/subscriptions.service";
import { copy } from "../telegram/telegram-copy";
import { TelegramService } from "../telegram/telegram.service";

import { AlertCandidatesRepository, type PostingCandidate } from "./alert-candidates.repository";
import {
  AlertLedgerRepository,
  type LedgerWrite,
  type LegacyMessage,
  type PositionLedgerEntry,
} from "./alert-ledger.repository";
import { decide } from "./decide";

const CANDIDATE_WINDOW_MS = 24 * 3_600_000;
const DEFAULT_WEB_BASE_URL = "https://www.metahunt.app";

export interface ChatRunResult {
  candidates: number;
  sent: number;
  bumped: number;
  absorbed: number;
  collapsed: number;
  skipped: number;
  failed: number;
  legacy: number;
}

// Telegram answered, so the message was definitely not delivered. Anything
// else (timeout, dropped connection) may have been delivered.
function isTelegramRefusal(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { error_code?: unknown }).error_code === "number"
  );
}

// Alerts v2 (md/journal/migrations/alerts.md §4): one chat run = candidates →
// decide() in seen order → claim → send. The ledger is per chat and posting.
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly applyBaseUrl: string;
  private readonly webBaseUrl: string;

  constructor(
    config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly candidates: AlertCandidatesRepository,
    private readonly ledger: AlertLedgerRepository,
    private readonly sentNotifications: SentNotificationsService,
    private readonly telegram: TelegramService,
  ) {
    this.applyBaseUrl = config.get<string>("PUBLIC_BASE_URL")!;
    this.webBaseUrl = config.get<string>("WEB_BASE_URL") ?? DEFAULT_WEB_BASE_URL;
  }

  async deliverChat(chatId: string): Promise<ChatRunResult> {
    const result: ChatRunResult = {
      candidates: 0,
      sent: 0,
      bumped: 0,
      absorbed: 0,
      collapsed: 0,
      skipped: 0,
      failed: 0,
      legacy: 0,
    };
    if (!this.telegram.canSendTo(chatId)) {
      this.logger.log(`chat run ${chatId}: not allowed outside production, skipped`);
      return result;
    }

    const legacy = await this.ledger.lazyInit(chatId);
    if (legacy) {
      result.legacy = await this.sendLegacy(chatId, legacy);
      this.logRun(chatId, result, " (lazy init)");
      return result;
    }

    const subs = await this.subscriptions.listAlertSubscriptions(chatId);
    if (subs.length === 0) return result;

    const now = new Date();
    const windowStart = new Date(now.getTime() - CANDIDATE_WINDOW_MS);
    const candidates = await this.candidates.forChat(
      subs.map((subscription) => ({
        subscription,
        since: laterOf(subscription.alertsFloorAt ?? now, windowStart),
      })),
    );
    result.candidates = candidates.length;
    const ledger = await this.loadLedger(chatId, candidates);
    const bumpsBySub = new Map(subs.map((s) => [s.id, s.alertsBumps]));

    try {
      for (const candidate of candidates) {
        await this.handle(chatId, candidate, ledger, bumpsBySub, now, result);
      }
    } catch (err) {
      this.logRun(chatId, result, " (aborted)");
      throw err;
    }
    if (result.sent > 0) await this.clearUnreachable(subs);
    this.logRun(chatId, result, "");
    return result;
  }

  private async handle(
    chatId: string,
    candidate: PostingCandidate,
    ledger: PositionLedger,
    bumpsBySub: Map<string, boolean>,
    now: Date,
    result: ChatRunResult,
  ): Promise<void> {
    const members = ledger.get(candidate.positionId) ?? new Map<string, PositionLedgerEntry>();
    const row = members.get(candidate.vacancyId) ?? null;
    const matching = candidate.subscriptionIds.map((id) => ({
      id,
      alertsBumps: bumpsBySub.get(id) ?? true,
    }));
    const decision = decide({
      candidate,
      row,
      siblings: [...members.values()],
      subscriptions: matching,
      now,
    });

    if (decision.action === "skip") {
      result.skipped++;
      return;
    }

    const attributedTo =
      decision.kind === "bumped"
        ? (matching.find((s) => s.alertsBumps) ?? matching[0])
        : matching[0];
    const write: LedgerWrite = {
      chatId,
      vacancyId: candidate.vacancyId,
      positionId: candidate.positionId,
      versionAt: candidate.versionAt,
      kind: decision.kind,
      subscriptionId: attributedTo.id,
    };
    const remember = (notifiedAt: Date | null): void => {
      members.set(candidate.vacancyId, {
        vacancyId: candidate.vacancyId,
        sourceId: candidate.sourceId,
        positionId: candidate.positionId,
        versionAt: candidate.versionAt,
        notifiedAt,
        kind: decision.kind,
      });
      ledger.set(candidate.positionId, members);
    };

    if (decision.action === "record") {
      await this.ledger.record(write);
      remember(row?.notifiedAt ?? null);
      result[decision.kind]++;
      return;
    }

    if (!(await this.ledger.claim(write))) {
      result.skipped++;
      return;
    }
    const html = renderAlertCard(
      candidate.card,
      {
        totalNew: 1,
        applyBaseUrl: this.applyBaseUrl,
        webBaseUrl: this.webBaseUrl,
        subscriptionId: attributedTo.id,
      },
      decision.kind,
    );
    try {
      await this.telegram.sendMessage(chatId, html, {
        disableNotification: result.sent > 0,
      });
    } catch (err) {
      // Unknown outcome keeps the claim: a lost card beats a repeat (I8).
      if (!isTelegramRefusal(err)) throw err;
      await this.ledger.undo(write, row);
      if (isChatUnreachable(err)) {
        await this.markUnreachable(chatId);
        throw err;
      }
      result.failed++;
      this.logger.warn(
        `chat run ${chatId}: posting ${candidate.vacancyId} refused by Telegram: ${errorText(err)}`,
      );
      return;
    }
    remember(new Date());
    result.sent++;
    if (decision.kind === "bumped") result.bumped++;
    // Rollout only: keeps v1's anti-join correct if the flag is turned back.
    await this.sentNotifications.record(attributedTo.id, [candidate.vacancyId]);
  }

  private async loadLedger(
    chatId: string,
    candidates: PostingCandidate[],
  ): Promise<PositionLedger> {
    const positionIds = [...new Set(candidates.map((c) => c.positionId))];
    const ledger: PositionLedger = new Map();
    for (const entry of await this.ledger.forPositions(chatId, positionIds)) {
      const members = ledger.get(entry.positionId) ?? new Map<string, PositionLedgerEntry>();
      members.set(entry.vacancyId, entry);
      ledger.set(entry.positionId, members);
    }
    return ledger;
  }

  // One-time nudges; a failure is logged, never retried — the init already committed.
  private async sendLegacy(chatId: string, messages: LegacyMessage[]): Promise<number> {
    let sent = 0;
    for (const message of messages) {
      const html =
        message === "cvRetired"
          ? copy.legacy.cvRetired(this.webBaseUrl)
          : copy.legacy.loginToManage(`${this.webBaseUrl}/me`);
      try {
        await this.telegram.sendMessage(chatId, html, { disableNotification: sent > 0 });
        sent++;
      } catch (err) {
        if (isChatUnreachable(err)) await this.markUnreachable(chatId);
        this.logger.warn(`chat run ${chatId}: legacy ${message} not sent: ${errorText(err)}`);
      }
    }
    return sent;
  }

  private async markUnreachable(chatId: string): Promise<void> {
    for (const sub of await this.subscriptions.listAlertSubscriptions(chatId)) {
      await this.subscriptions.recordUnreachableDelivery(sub.id);
    }
  }

  private async clearUnreachable(subs: AlertSubscriptionRow[]): Promise<void> {
    for (const sub of subs) await this.subscriptions.clearUnreachable(sub.id);
  }

  private logRun(chatId: string, r: ChatRunResult, suffix: string): void {
    this.logger.log(
      `chat run ${chatId}${suffix}: candidates ${r.candidates} / sent ${r.sent} / bumped ${r.bumped}` +
        ` / absorbed ${r.absorbed} / collapsed ${r.collapsed} / skipped ${r.skipped}` +
        ` / failed ${r.failed} / legacy ${r.legacy}`,
    );
  }
}

type PositionLedger = Map<string, Map<string, PositionLedgerEntry>>;

function laterOf(a: Date, b: Date): Date {
  return a.getTime() > b.getTime() ? a : b;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : JSON.stringify(err);
}
