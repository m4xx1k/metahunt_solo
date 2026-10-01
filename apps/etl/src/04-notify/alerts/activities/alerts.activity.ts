import { Injectable } from "@nestjs/common";

import { ApplicationFailure } from "@temporalio/activity";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { isChatUnreachable } from "../../telegram/rate-limiter";
import { AlertsRouterService, type AlertsRunPlan } from "../alerts-router.service";
import { AlertsService, type ChatRunResult } from "../alerts.service";

@Injectable()
@Activity()
export class AlertsActivity {
  constructor(
    private readonly router: AlertsRouterService,
    private readonly alerts: AlertsService,
  ) {}

  @ActivityMethod()
  async planAlertsRun(): Promise<AlertsRunPlan> {
    return this.router.plan();
  }

  /** One chat run. Safe to retry: every send is claimed in the ledger first. */
  @ActivityMethod()
  async deliverAlertsToChat(chatId: string): Promise<ChatRunResult> {
    try {
      return await this.alerts.deliverChat(chatId);
    } catch (err) {
      if (isChatUnreachable(err)) {
        throw ApplicationFailure.nonRetryable(
          `Telegram chat ${chatId} unreachable`,
          "TelegramChatUnreachable",
        );
      }
      throw err;
    }
  }
}
