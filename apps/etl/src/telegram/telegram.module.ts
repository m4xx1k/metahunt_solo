import { Module } from "@nestjs/common";

import { FeedModule } from "../feed/feed.module";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

// Isolated bot module: inbound `/start`, `/stop`, `/help` (grammy poller), the
// `POST /subscriptions` create endpoint (web "Subscribe"), plus a stateless
// outbound `sendMessage`. Exports TelegramService so the future digest activity
// can deliver without depending on the poller internals.
@Module({
  imports: [FeedModule],
  controllers: [SubscriptionsController],
  providers: [TelegramService, SubscriptionsService],
  exports: [TelegramService, SubscriptionsService],
})
export class TelegramModule {}
