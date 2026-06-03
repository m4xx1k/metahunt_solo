import { Module } from "@nestjs/common";

import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

// Isolated bot module: inbound `/start`, `/stop`, `/help` (grammy poller) plus a
// stateless outbound `sendMessage`. Exports TelegramService so the future digest
// activity can deliver without depending on the poller internals.
@Module({
  providers: [TelegramService, SubscriptionsService],
  exports: [TelegramService, SubscriptionsService],
})
export class TelegramModule {}
