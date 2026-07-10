import { Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";

import { DigestService } from "./digest.service";

// Manual digest trigger — runs delivery directly (no Temporal) so the HTTP
// response carries the counts. The fast local-test hook and an operator
// "re-send now"; the scheduled path uses notifySubscribersWorkflow, not this.
@Controller("digest")
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  /** Dry-run match, no send. `{ total, label, titles }`. */
  @Get("preview/:subscriptionId")
  async preview(@Param("subscriptionId") subscriptionId: string) {
    const result = await this.digest.preview(subscriptionId);
    if (!result) throw new NotFoundException("subscription not found");
    return result;
  }

  /** Deliver to every active subscription. `{ subscriptions, sent }`. */
  @Post("run")
  runAll(): Promise<{ subscriptions: number; sent: number }> {
    return this.digest.runForAllActive();
  }

  /** Deliver to one subscription. `{ sent }` (0 if gone or nothing new). */
  @Post("run/:subscriptionId")
  async runOne(@Param("subscriptionId") subscriptionId: string): Promise<{ sent: number }> {
    return { sent: await this.digest.deliver(subscriptionId) };
  }
}
