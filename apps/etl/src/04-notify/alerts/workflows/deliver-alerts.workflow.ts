import { log, proxyActivities, type RetryPolicy } from "@temporalio/workflow";

import type { NotifyActivity } from "../../telegram/activities/notify.activity";
import type { AlertsActivity } from "../activities/alerts.activity";

const RETRY: RetryPolicy = {
  maximumAttempts: 5,
  initialInterval: "2s",
  maximumInterval: "30s",
  backoffCoefficient: 2,
};

const { deliverToSubscription } = proxyActivities<typeof NotifyActivity.prototype>({
  startToCloseTimeout: "2m",
  retry: RETRY,
});

const { planAlertsRun, deliverAlertsToChat } = proxyActivities<typeof AlertsActivity.prototype>({
  startToCloseTimeout: "10m",
  retry: RETRY,
});

/**
 * One hourly delivery run, split by the alerts flag: v1 subscriptions through
 * the digest, v2 chats through the alerts engine. Sequential, and each unit is
 * isolated so one failing chat never starves the ones behind it.
 */
export async function deliverAlertsWorkflow(): Promise<{
  subscriptions: number;
  chats: number;
  sent: number;
  failed: number;
}> {
  const plan = await planAlertsRun();
  let sent = 0;
  let failed = 0;
  for (const id of plan.subscriptionIds) {
    try {
      sent += await deliverToSubscription(id);
    } catch (err) {
      failed += 1;
      log.warn(`digest delivery failed for subscription ${id}`, { err });
    }
  }
  for (const chatId of plan.chatIds) {
    try {
      sent += (await deliverAlertsToChat(chatId)).sent;
    } catch (err) {
      failed += 1;
      log.warn(`alerts delivery failed for chat ${chatId}`, { err });
    }
  }
  return { subscriptions: plan.subscriptionIds.length, chats: plan.chatIds.length, sent, failed };
}
