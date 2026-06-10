import { log, proxyActivities } from "@temporalio/workflow";

import type { NotifyActivity } from "../activities/notify.activity";

const { listActiveSubscriptionIds, deliverToSubscription } = proxyActivities<
  typeof NotifyActivity.prototype
>({
  startToCloseTimeout: "2m",
  retry: { maximumAttempts: 3 },
});

/**
 * Fan over every active subscription and push its digest of new, unsent
 * vacancies (subscriptions with nothing new send nothing). Sequential: Telegram
 * is globally rate-limited and each delivery already self-heals on retry, so
 * fanning out buys nothing.
 *
 * Each delivery is isolated: one subscription failing (e.g. the user blocked
 * the bot) must not starve every subscription queued behind it, so a failure is
 * logged and the loop moves on. The failed delivery rides the next scheduled
 * run — its vacancies stay unsent in the anti-join.
 */
export async function notifySubscribersWorkflow(): Promise<{
  subscriptions: number;
  sent: number;
  failed: number;
}> {
  const ids = await listActiveSubscriptionIds();
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      sent += await deliverToSubscription(id);
    } catch (err) {
      failed += 1;
      log.warn(`digest delivery failed for subscription ${id}`, { err });
    }
  }
  return { subscriptions: ids.length, sent, failed };
}
