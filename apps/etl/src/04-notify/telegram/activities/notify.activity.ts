import { Injectable } from "@nestjs/common";

import { ApplicationFailure } from "@temporalio/activity";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DigestService } from "../digest.service";
import { isChatUnreachable } from "../rate-limiter";
import { SubscriptionsService } from "../subscriptions.service";

// Thin Temporal seam over the digest services. The workflow stays pure
// orchestration; all IO (DB, Telegram) lives behind these two calls.
@Injectable()
@Activity()
export class NotifyActivity {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly digest: DigestService,
  ) {}

  @ActivityMethod()
  async listActiveSubscriptionIds(): Promise<string[]> {
    return this.subscriptions.listActiveIds();
  }

  /** Match → page → send → record for one subscription. Returns new-vacancy count. */
  @ActivityMethod()
  async deliverToSubscription(subscriptionId: string): Promise<number> {
    try {
      return await this.digest.deliver(subscriptionId);
    } catch (err) {
      // A 403 means the chat is unreachable (user blocked the bot). Retrying
      // can't fix that, so surface it as non-retryable: the activity fails on
      // the first attempt and the workflow skips to the next subscriber. The
      // subscription stays active, so delivery resumes on its own once the user
      // unblocks — no re-subscribe needed.
      if (isChatUnreachable(err)) {
        throw ApplicationFailure.nonRetryable(
          `Telegram chat unreachable for subscription ${subscriptionId}`,
          "TelegramChatUnreachable",
        );
      }
      throw err;
    }
  }
}
