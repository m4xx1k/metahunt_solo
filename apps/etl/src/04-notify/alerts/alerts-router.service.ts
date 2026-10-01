import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DigestService } from "../telegram/digest.service";
import { SubscriptionsService } from "../telegram/subscriptions.service";

import { alertsFlags } from "./alerts-flags";
import { AlertsService } from "./alerts.service";

export interface AlertsRunPlan {
  /** v1: delivered per subscription by DigestService. */
  subscriptionIds: string[];
  /** v2: delivered per chat by AlertsService. */
  chatIds: string[];
}

export interface AlertsRunResult {
  subscriptions: number;
  chats: number;
  sent: number;
  failed: number;
}

// Splits one delivery run between the engines by ALERTS_ENGINE and the canary
// list. The scheduled workflow and POST /digest/run share this split.
@Injectable()
export class AlertsRouterService {
  private readonly logger = new Logger(AlertsRouterService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly digest: DigestService,
    private readonly alerts: AlertsService,
  ) {}

  async plan(): Promise<AlertsRunPlan> {
    const { engine, canaryChatIds } = alertsFlags(this.config);
    if (engine === "v2") {
      return { subscriptionIds: [], chatIds: await this.subscriptions.listActiveChatIds() };
    }
    if (canaryChatIds.size === 0) {
      return { subscriptionIds: await this.subscriptions.listActiveIds(), chatIds: [] };
    }
    const active = await this.subscriptions.listActiveRefs();
    return {
      subscriptionIds: active.filter((s) => !canaryChatIds.has(s.chatId)).map((s) => s.id),
      chatIds: [...new Set(active.map((s) => s.chatId).filter((c) => canaryChatIds.has(c)))],
    };
  }

  /** The manual trigger: the same split, run in-process so the response carries counts. */
  async runAll(): Promise<AlertsRunResult> {
    const plan = await this.plan();
    const result: AlertsRunResult = {
      subscriptions: plan.subscriptionIds.length,
      chats: plan.chatIds.length,
      sent: 0,
      failed: 0,
    };
    for (const id of plan.subscriptionIds) {
      try {
        result.sent += await this.digest.deliver(id);
      } catch (err) {
        result.failed++;
        this.logger.warn(`digest delivery failed for sub ${id}: ${errorText(err)}`);
      }
    }
    for (const chatId of plan.chatIds) {
      try {
        result.sent += (await this.alerts.deliverChat(chatId)).sent;
      } catch (err) {
        result.failed++;
        this.logger.warn(`alerts delivery failed for chat ${chatId}: ${errorText(err)}`);
      }
    }
    return result;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
