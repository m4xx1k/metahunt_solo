import { proxyActivities } from "@temporalio/workflow";

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
 */
export async function notifySubscribersWorkflow(): Promise<{
  subscriptions: number;
  sent: number;
}> {
  const ids = await listActiveSubscriptionIds();
  let sent = 0;
  for (const id of ids) {
    sent += await deliverToSubscription(id);
  }
  return { subscriptions: ids.length, sent };
}
