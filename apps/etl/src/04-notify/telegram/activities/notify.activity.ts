import { Injectable } from "@nestjs/common";
import { Activity, ActivityMethod } from "nestjs-temporal-core";

import { DigestService } from "../digest.service";
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
    return this.digest.deliver(subscriptionId);
  }
}
